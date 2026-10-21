// Node CPU timing of a 3D figure's runtime: what each part kind costs to emit, and the paint order.
//
//   node scripts/turn-bench.mjs <build.mjs> [--rounds 7] [--unit 1]
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { TURN } from "../kit/turn.mjs";

const args = process.argv.slice(2);
if (!args.length || args.includes("--help") || args.includes("-h")) {
  console.log(`Time the 3D runtime on a figure, in Node.

  node scripts/turn-bench.mjs <build.mjs> [--rounds 7] [--unit 1]

The module must export T (the scene from turning(), already built). If it also exports
follow(values), every angle is mapped through it, so coupled groups move as on the page.
The first turn group is swept through 360 angles; each round times every part's emit and
each layer's order, and the medians over the rounds are printed by part kind.`);
  process.exit(args.length ? 0 : 1);
}

const option = (name, fallback) => {
  const at = args.indexOf(name);
  if (at < 0) return fallback;
  const value = Number(args[at + 1]);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`turn-bench: ${name} needs a positive number`);
    process.exit(1);
  }
  return value;
};
const file = args[0];
const roundsWanted = Math.round(option("--rounds", 7));
const unit = option("--unit", 1);

const mod = await import(pathToFileURL(resolve(file)).href);
const T = mod.T;
if (!T || !T.data) {
  console.error(`turn-bench: ${file} must export T, built with T.build()`);
  process.exit(1);
}
const follow = typeof mod.follow === "function" ? mod.follow : (values) => values;
const scene = TURN.prepare(T.data, { unit });
const runs = scene.runs;
const frames = runs.map((run) => TURN.frame(run));
const turn = scene.groups.find((g) => g.kind === "turn");
if (!turn) {
  console.error(`turn-bench: ${file} has no turn group to sweep`);
  process.exit(1);
}
const ANGLES = 360;
const cameras = Array.from({ length: ANGLES }, (_, i) => TURN.cams(scene, follow({ [turn.name]: i + 0.37 })));

function round() {
  const partMs = new Float64Array(runs.length);
  let orderMs = 0;
  const previous = scene.layers.map((layer) => layer.rest);
  const wall0 = performance.now();
  const cpu0 = process.cpuUsage();
  for (const cams of cameras) {
    for (const run of runs) {
      const t0 = performance.now();
      TURN.emit(run, run.group >= 0 ? cams[run.group] : cams.world, frames[run.index]);
      partMs[run.index] += performance.now() - t0;
    }
    const t1 = performance.now();
    scene.layers.forEach((layer, index) => {
      previous[index] = TURN.order(layer, frames, cams, previous[index], {}, scene);
    });
    orderMs += performance.now() - t1;
  }
  const cpu = process.cpuUsage(cpu0);
  return { partMs: Array.from(partMs, (ms) => ms / ANGLES), order: orderMs / ANGLES, wall: (performance.now() - wall0) / ANGLES, cpu: (cpu.user + cpu.system) / 1000 / ANGLES };
}

round();
const results = Array.from({ length: roundsWanted }, round);
const median = (list) => {
  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const perPart = runs.map((_, i) => median(results.map((r) => r.partMs[i])));
const ms = (v) => v.toFixed(v < 0.1 ? 4 : 3);

console.log(`turn-bench ${file} · ${runs.length} parts · ${ANGLES} angles · median of ${roundsWanted} rounds · unit ${unit}`);
const kinds = new Map();
runs.forEach((run, i) => {
  const kind = run.kind === "tube" ? "tube chunk" : run.kind;
  if (!kinds.has(kind)) kinds.set(kind, []);
  kinds.get(kind).push(perPart[i]);
});
const width = Math.max(...[...kinds.keys()].map((kind) => kind.length));
for (const [kind, list] of [...kinds].sort((a, b) => b[1].reduce((s, v) => s + v, 0) - a[1].reduce((s, v) => s + v, 0))) {
  const total = list.reduce((s, v) => s + v, 0);
  console.log(`  ${kind.padEnd(width)} ${String(list.length).padStart(3)} parts · ${ms(total / list.length)} ms per part · ${ms(total)} ms per frame · slowest ${ms(Math.max(...list))} ms`);
}
const slowest = runs.map((run, i) => [run.name, perPart[i]]).sort((a, b) => b[1] - a[1]).slice(0, 6);
console.log(`  slowest parts: ${slowest.map(([name, v]) => `${name} ${ms(v)}`).join(" · ")}`);
const layers = scene.layers.map((layer) => `${layer.name}: ${layer.parts.length} parts, ${layer.planar.length / 5} planes, ${layer.dynamic.length / 2} dynamic`).join("; ");
console.log(`  order ${ms(median(results.map((r) => r.order)))} ms per frame (${layers})`);
console.log(`  frame ${ms(median(results.map((r) => r.wall)))} ms wall · ${ms(median(results.map((r) => r.cpu)))} ms CPU`);
