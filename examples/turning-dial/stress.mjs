// Stress hand: a performance and layer-proof scene for the 3D mode, not an audit-clean one.
// A dense hand of hinge chains rides a turntable among static workshop clutter (a bench, the
// turntable's base, a power unit, a tool rack, a cable reel, a tray, a wrench, three bench
// cables). Its bench cables carry no `touch` and its hand has loose links, so the kit audit
// fails it on purpose; take authoring patterns from build.mjs.
//
//   node stress.mjs --light            -> turning-stress-light.html
//   node stress.mjs [--light] [--verify] [--audit [--quick] [--only=…] [--verbose]]
//
// Importing this module builds the scene (P, T, follow, poses) and writes nothing.
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import * as G from "../../kit/lathe.mjs";
import * as A from "../../kit/audit.mjs";
import { tubePieces, tubeSvg } from "../../kit/tube.mjs";
import { turning } from "../../kit/turn-build.mjs";
import * as TA from "../../kit/turn-audit.mjs";
import { turnScript } from "../../scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const MAIN = Boolean(process.argv[1]) && resolve(process.argv[1]) === SELF;
const FLAGS = MAIN ? process.argv.slice(2) : [];
const has = (flag) => FLAGS.includes(flag);
const LIGHT = has("--light");
const VERIFY = has("--verify");

const W = 760;
const H = 560;
const RAD = Math.PI / 180;
const add = G.add3;
const sub = G.sub3;
const mul = G.mul3;
const unit = G.unit3;
const UP = (x, y) => ({ o: [x, y, 0], a: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] });
const polar = (deg, d) => [d * Math.cos(deg * RAD), d * Math.sin(deg * RAD)];

const BENCH = { x: -118, y: -104, w: 236, d: 208, r: 6 };
export const P = k.fitProjection([...k.boxCorners(BENCH, -8, 0), [0, 0, 60], ...[160, 250].map((deg) => [...polar(deg, 92), 62])], W, H, { pad: 20, azimuth: 40, elevation: 31 });
export const R = A.recorder(P);
export const T = turning(P, { recorder: R });

const DIGITS = ["f0", "f1", "f2", "f3", "thumb"];
const table = T.group("table", { turn: { pivot: [0, 0] } });
const hand = T.layer("hand");
T.stack(["back", "hand", "front"]);

// ---------------------------------------------------------------------------
// Motion (inlined into the page; uses only Math).
export function follow(values) {
  const out = { ...values };
  const time = Number(out.time ?? 0) || 0;
  const lift = Math.max(0, Math.min(1, Number(out.lift ?? 0) || 0));
  out.table = Number(out.table ?? 0) || 0;
  out.wrist = 3 * lift * Math.sin(time * 1.3);
  out.thumb = 10 * lift * Math.sin(time * 0.9 + 0.6);
  ["f0", "f1", "f2", "f3", "thumb"].forEach((tag, i) => {
    for (let j = 0; j < 3; j++) out[`${tag}.j${j}`] = 5 * lift * Math.sin(time * 2.1 + i * 0.7 + j * 0.9);
  });
  return out;
}

export function poses() {
  const out = [];
  for (let i = 0; i < 360; i++) out.push(follow({ table: i, lift: 1, time: i / 30 }));
  for (let i = 0; i < 72; i++) out.push(follow({ table: i * 5, lift: 0 }));
  return out;
}

// ---------------------------------------------------------------------------
// The turntable's live parts: platter, hub, column, bolts, terminal blocks and a loom.
const PLATTER = { r: 38, z: 10, top: 13 };
T.round({ name: "table.platter", group: table, layer: hand, F: UP(0, 0), s0: PLATTER.z, s1: PLATTER.top, r: PLATTER.r, material: "steel", details: { ribs: { s0: PLATTER.z + 0.4, s1: PLATTER.top - 0.4, count: 140, tone: "lo" }, seams: [PLATTER.z + 0.4, PLATTER.top - 0.4] } });
T.round({ name: "table.hub", group: table, layer: hand, F: UP(0, 0), s0: PLATTER.top, s1: 16, r: 8, material: "gunmetal" });
T.round({ name: "table.column", group: table, layer: hand, F: UP(0, 0), s0: 16, s1: 26, r: 5, material: "chrome" });
for (let i = 0; i < 8; i++) {
  const [x, y] = polar(22.5 + i * 45, 31);
  T.round({ name: `table.bolt${i}`, group: table, layer: hand, F: UP(x, y), s0: PLATTER.top, s1: PLATTER.top + 0.8, r: 1.2, material: "brass" });
}
for (let i = 0; i < 7; i++) {
  const deg = 100 + i * 40;
  const radial = [Math.cos(deg * RAD), Math.sin(deg * RAD), 0];
  const side = [-radial[1], radial[0], 0];
  const inner = 18.5;
  const ring = [[-1.6, -inner], [1.6, -inner], [1.6, -inner - 3], [-1.6, -inner - 3]];
  T.prism({ name: `table.terminal${i}`, group: table, layer: hand, F: { o: [0, 0, 0], a: [0, 0, 1], u: side, v: mul(radial, -1) }, polygon: ring, s0: PLATTER.top, s1: PLATTER.top + 2.6, material: "gunmetal" });
  for (const [j, offset] of [-0.75, 0.75].entries()) {
    const start = add(add(mul(radial, inner), mul(side, offset)), [0, 0, PLATTER.top + 1.3]);
    const end = add(add(mul(radial, 8.4), mul(side, offset)), [0, 0, PLATTER.top + 1.3]);
    T.tube({ name: `table.loom${i}${"ab"[j]}`, group: table, layer: hand, route: [start, end], r: 0.45, chunk: 3.6, hue: ["red", "blue", "green"][(i + j) % 3], material: "rubber", bundle: "loom" });
  }
}

// ---------------------------------------------------------------------------
// The wrist carries the palm plate, manifold, valves, knuckle block, bolts, four rams and palm cables.
const PALM = { x: -14, y: -13, w: 28, d: 26, r: 2 };
const PALM_Z = 26;
const PALM_TOP = 29;
const wrist = T.group("wrist", { parent: table, hinge: { point: [0, 0, PALM_Z], axis: [0, 1, 0], range: [-3, 3] } });
T.prism({ name: "hand.palm", group: wrist, layer: hand, plan: PALM, z: PALM_Z, h: PALM_TOP - PALM_Z, bevel: 0.6, material: "gold" });
T.prism({ name: "hand.manifold", group: wrist, layer: hand, plan: { x: -12, y: -8, w: 7, d: 16, r: 0.6 }, z: PALM_TOP, h: 3, material: "gunmetal" });
for (let i = 0; i < 4; i++) T.round({ name: `hand.valve${i}`, group: wrist, layer: hand, F: UP(-8.5, -6 + i * 4), s0: PALM_TOP + 3, s1: PALM_TOP + 4.6, r: 1.2, material: "brass" });
const KNUCKLE_X = PALM.x + PALM.w;
T.prism({ name: "hand.knuckles", group: wrist, layer: hand, plan: { x: KNUCKLE_X - 3, y: -12.5, w: 3, d: 25, r: 0.5 }, z: PALM_TOP, h: 2, material: "steel" });
for (const [i, [x, y]] of [[-12.5, -12], [-12.5, 12], [-2, -12], [-2, 12], [8, -12], [8, 12]].entries()) T.round({ name: `hand.bolt${i}`, group: wrist, layer: hand, F: UP(x, y), s0: PALM_TOP, s1: PALM_TOP + 0.6, r: 0.8, material: "steel" });
const LANES = [-9.5, -3.5, 3.5, 9.5];
for (const [i, y] of LANES.entries()) {
  const z = PALM_TOP + 2.2;
  const along = (o) => G.frameAlong(o, [1, 0, 0]);
  T.prism({ name: `hand.ram${i}.saddle`, group: wrist, layer: hand, plan: { x: -2, y: y - 1.4, w: 2, d: 2.8, r: 0.3 }, z: PALM_TOP, h: z - 1.3 - PALM_TOP, material: "gunmetal" });
  T.prism({ name: `hand.ram${i}.saddle2`, group: wrist, layer: hand, plan: { x: 3, y: y - 1.4, w: 2, d: 2.8, r: 0.3 }, z: PALM_TOP, h: z - 1.3 - PALM_TOP, material: "gunmetal" });
  T.round({ name: `hand.ram${i}.cap`, group: wrist, layer: hand, F: along([-4, y, z]), s0: 0, s1: 0.8, r: 1.1, material: "brass" });
  T.round({ name: `hand.ram${i}.body`, group: wrist, layer: hand, F: along([-3.2, y, z]), s0: 0, s1: 9, r: 1.3, material: "steel" });
  T.round({ name: `hand.ram${i}.gland`, group: wrist, layer: hand, F: along([5.8, y, z]), s0: 0, s1: 0.9, r: 1, material: "brass" });
  T.round({ name: `hand.ram${i}.rod`, group: wrist, layer: hand, F: along([6.7, y, z]), s0: 0, s1: 3.6, r: 0.45, material: "chrome" });
  T.prism({ name: `hand.ram${i}.clevis`, group: wrist, layer: hand, plan: { x: 10.3, y: y - 0.9, w: 0.7, d: 1.8, r: 0.2 }, z: z - 0.9, h: 1.8, material: "gunmetal" });
  T.tube({ name: `hand.ram${i}.hose`, group: wrist, layer: hand, route: [[-5, y, z], [-4.2, y, z]], r: 0.35, material: "rubber" });
}
for (const y of [-7.4, -6.5, -5.6, -0.45, 0.45, 5.6, 6.5, 7.4]) {
  for (const [part, x0, x1] of [["a", -5, 4.6], ["b", 5.4, KNUCKLE_X - 3]]) T.tube({ name: `hand.lane${y}${part}`, group: wrist, layer: hand, route: [[x0, y, PALM_TOP + 0.5], [x1, y, PALM_TOP + 0.5]], r: 0.4, chunk: 2.6, hue: y < 0 ? "red" : "blue", material: "rubber", bundle: "palm" });
}

// The thumb's base: a turret on the palm's side, turning about a vertical axis, and its arm.
const TURRET = [-4, PALM.y - 2.5];
const thumb = T.group("thumb", { parent: wrist, hinge: { point: [TURRET[0], TURRET[1], PALM_Z], axis: [0, 0, 1], range: [-10, 10] } });
T.round({ name: "hand.thumb.turret", group: thumb, layer: hand, F: UP(TURRET[0], TURRET[1]), s0: PALM_Z - 0.5, s1: PALM_TOP + 0.5, r: 2.5, material: "chrome" });
T.prism({ name: "hand.thumb.arm", group: thumb, layer: hand, F: { o: [TURRET[0], TURRET[1], 0], a: [0, 0, 1], u: [0, -1, 0], v: [1, 0, 0] }, polygon: [[2.5, -1.4], [8, -1.1], [8, 1.1], [2.5, 1.4]], s0: PALM_Z, s1: PALM_TOP, material: "gold" });

// ---------------------------------------------------------------------------
// Digits: three hinged links each, with discs, side plates, bosses, rivets, spine, block, pad and clip.
const LINK = { r: 1.6, c: 1.7, disc: 2.2, lengths: [9, 8, 6], slopes: [0, -12, -24] };
function digit(tag, parent, J0, heading) {
  const h = unit(heading);
  const w = unit(G.cross3([0, 0, 1], h));
  let J = J0;
  let up = parent;
  for (let j = 0; j < 3; j++) {
    const s = LINK.slopes[j] * RAD;
    const d = add(mul(h, Math.cos(s)), [0, 0, Math.sin(s)]);
    const n = add(mul(h, -Math.sin(s)), [0, 0, Math.cos(s)]);
    const next = add(J, mul(d, LINK.lengths[j]));
    const g = T.group(`${tag}.j${j}`, { parent: up, hinge: { point: J, axis: w, range: [-5, 5] } });
    const base = `hand.${tag}.l${j}`;
    const a = add(J, mul(d, LINK.c));
    const b = sub(next, mul(d, LINK.c));
    const length = G.len3(sub(b, a));
    const mid = mul(add(a, b), 0.5);
    T.round({ name: `${base}.link`, group: g, layer: hand, F: G.frameAlong(a, d), s0: 0, s1: length, r: LINK.r, ends: ["dome", "dome"], material: "chrome" });
    for (const [side, sign] of [["a", 1], ["b", -1]]) {
      const ws = mul(w, sign);
      T.round({ name: `${base}.disc${side}`, group: g, layer: hand, F: G.frameAlong(J, ws), s0: LINK.r, s1: LINK.r + 0.5, r: LINK.disc, material: "gunmetal" });
      const plate = { o: mid, a: ws, u: d, v: n };
      T.prism({ name: `${base}.plate${side}`, group: g, layer: hand, F: plate, polygon: [[-length * 0.32, -1.3], [length * 0.32, -1.3], [length * 0.32, 1.3], [-length * 0.32, 1.3]], s0: LINK.r + 0.6, s1: LINK.r + 1, material: "steel" });
      T.round({ name: `${base}.boss${side}`, group: g, layer: hand, F: G.frameAlong(mid, ws), s0: LINK.r + 1, s1: LINK.r + 1.4, r: 0.6, material: "brass" });
      if (length > 4) for (const [r, offset] of [[0, -1], [1, 1]]) T.round({ name: `${base}.rivet${side}${r}`, group: g, layer: hand, F: G.frameAlong(add(mid, mul(d, offset * 1.05)), ws), s0: LINK.r + 1, s1: LINK.r + 1.25, r: 0.3, material: "gunmetal" });
    }
    const top = add(mid, mul(n, LINK.r));
    T.prism({ name: `${base}.spine`, group: g, layer: hand, F: { o: top, a: n, u: d, v: w }, polygon: [[-length * 0.36, -0.55], [length * 0.36, -0.55], [length * 0.36, 0.55], [-length * 0.36, 0.55]], s0: 0, s1: 0.5, material: "gunmetal" });
    T.prism({ name: `${base}.block`, group: g, layer: hand, F: { o: top, a: n, u: d, v: w }, polygon: [[-0.8, -0.5], [0.8, -0.5], [0.8, 0.5], [-0.8, 0.5]], s0: 0.5, s1: 1.5, material: "steel" });
    const clipAt = length * 0.36 - 0.35;
    if (length > 3.5) T.prism({ name: `${base}.clip`, group: g, layer: hand, F: { o: top, a: n, u: d, v: w }, polygon: [[clipAt - 0.35, -0.5], [clipAt + 0.35, -0.5], [clipAt + 0.35, 0.5], [clipAt - 0.35, 0.5]], s0: 0.5, s1: 1.4, material: "gunmetal" });
    T.prism({ name: `${base}.pad`, group: g, layer: hand, F: { o: sub(mid, mul(n, LINK.r)), a: mul(n, -1), u: d, v: w }, polygon: [[-length * 0.25, -0.8], [length * 0.25, -0.8], [length * 0.25, 0.8], [-length * 0.25, 0.8]], s0: 0, s1: 0.45, material: "rubber" });
    if (j < 2) {
      const lift = add(top, mul(n, 1));
      T.tube({ name: `hand.${tag}.cable${j}`, group: g, layer: hand, route: [add(lift, mul(d, 0.8)), add(lift, mul(d, clipAt - 0.35))], r: 0.3, hue: "green", material: "rubber" });
    }
    J = next;
    up = g;
  }
}
LANES.forEach((y, i) => digit(DIGITS[i], wrist, [KNUCKLE_X + LINK.disc, y, PALM_TOP - 1.2], [1, 0, 0]));
digit("thumb", thumb, [TURRET[0], TURRET[1] - 8 - LINK.disc, PALM_TOP - 1.2], [0.3, -1, 0]);

// ---------------------------------------------------------------------------
// The workshop: static art in the back and front layers.
const solid = (paths, style) => k.solidSvg(paths, style);
const put = (item) => R.put(item);
const slab = (name, layer, plan, z, h, style = {}, mat = null) => {
  const svg = solid(k.slabOf(plan, z, h, P, 8), style);
  put({ name, layer, at: [plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2], svg: mat ? `<g data-mat="${mat}">${svg}</g>` : svg, shapes: [A.slab(plan, z, h, { name, ground: name === "stand.bench" })] });
};
const cylinder = (name, layer, [x, y], r, z, h, style = {}, mat = null) => {
  const svg = solid(k.cylinder(x, y, r, z, h, P, 32), style);
  put({ name, layer, at: [x, y, z + h / 2], svg: mat ? `<g data-mat="${mat}">${svg}</g>` : svg, shapes: [A.cylinder(x, y, r, z, h, { name })] });
};
const block = (name, layer, centre, deg, [w, d], z, h, style = {}, mat = null) => {
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  const ring = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, y]) => [centre[0] + x * c - y * s, centre[1] + x * s + y * c]);
  const svg = solid(k.extrude(ring, z, h, P), style);
  put({ name, layer, at: [centre[0], centre[1], z + h / 2], svg: mat ? `<g data-mat="${mat}">${svg}</g>` : svg, shapes: [A.extruded(ring, z, h, { name })] });
  return ring;
};

slab("stand.bench", "back", BENCH, -8, 8, { tone: "lo" });
cylinder("stand.flange", "back", [0, 0], 46, 0, 3, { tone: "mid" });
cylinder("stand.drum", "back", [0, 0], 40, 3, PLATTER.z - 3, { tone: "hi" }, "steel");

// Power unit behind the turntable, facing it, with vents and three knobs.
const UNIT_AT = 250;
const unitCentre = polar(UNIT_AT, 84);
block("stand.power", "back", unitCentre, UNIT_AT + 90, [34, 22], 0, 38, { tone: "mid" }, "gunmetal");
{
  const toward = [-Math.cos(UNIT_AT * RAD), -Math.sin(UNIT_AT * RAD)];
  const across = [-toward[1], toward[0]];
  const face = [unitCentre[0] + toward[0] * 11, unitCentre[1] + toward[1] * 11];
  block("stand.vents", "back", [face[0] + toward[0] * 0.5, face[1] + toward[1] * 0.5], UNIT_AT + 90, [26, 1], 6, 12, { tone: "lo" });
  for (let i = 0; i < 3; i++) {
    const at = [face[0] + across[0] * (i - 1) * 9, face[1] + across[1] * (i - 1) * 9, 26];
    const F = G.frameAlong(at, [toward[0], toward[1], 0]);
    put({ name: `stand.knob${i}`, layer: "back", at, svg: `<g data-mat="brass">${solid(G.disc(0, 2, 2.2, F, P), { tone: "hi" })}</g>`, shapes: [A.disc(F, 0, 2, 2.2, { name: `stand.knob${i}` })] });
  }
}

// Tool rack: a board, a shelf and seven tools standing on it.
const RACK_AT = 168;
const rackCentre = polar(RACK_AT, 92);
block("stand.rack", "back", rackCentre, RACK_AT + 90, [56, 4], 0, 46, { tone: "lo" });
{
  const toward = [-Math.cos(RACK_AT * RAD), -Math.sin(RACK_AT * RAD)];
  const across = [-toward[1], toward[0]];
  const shelf = [rackCentre[0] + toward[0] * 5, rackCentre[1] + toward[1] * 5];
  block("stand.shelf", "back", shelf, RACK_AT + 90, [54, 6], 20, 2, { tone: "mid" });
  for (let i = 0; i < 7; i++) {
    const at = [shelf[0] + across[0] * (i - 3) * 7, shelf[1] + across[1] * (i - 3) * 7];
    cylinder(`stand.tool${i}`, "back", at, i % 2 ? 1.2 : 1.8, 22, 8 + (i % 3) * 4, { tone: "hi" }, i % 2 ? "chrome" : "brass");
  }
}

// Low things around the base: a cable reel, a tray and a wrench, all under the platter.
const reelAt = polar(-40, 72);
cylinder("stand.reel", "back", reelAt, 11, 0, 8, { tone: "mid" }, "copper");
slab("stand.tray", "back", { x: 18, y: 58, w: 30, d: 18, r: 2 }, 0, 3.5, { tone: "mid" });
block("stand.wrench", "back", polar(105, 66), 20, [34, 4], 0, 1.2, { tone: "hi" }, "chrome");

// Three bench cables lying flat on the bench from the power unit to the base.
{
  const toward = [-Math.cos(UNIT_AT * RAD), -Math.sin(UNIT_AT * RAD)];
  const across = [-toward[1], toward[0]];
  const face = [unitCentre[0] + toward[0] * 11, unitCentre[1] + toward[1] * 11];
  ["red", "blue", "green"].forEach((hue, i) => {
    const r = 1;
    const start = [face[0] + across[0] * (i - 1) * 7, face[1] + across[1] * (i - 1) * 7, r];
    const goal = polar(UNIT_AT + 18 * (i - 1) + 40, 46);
    const mid = [start[0] + toward[0] * 12, start[1] + toward[1] * 12, r];
    const points = G.fillet([start, mid, [goal[0], goal[1], r]], 14);
    const pieces = tubePieces(points, r, P);
    const svg = `<g data-mat="rubber">${pieces.map((piece) => tubeSvg(piece).replace('<g class="tb">', `<g class="tb" data-hue="${hue}">`)).join("")}</g>`;
    R.route(`stand.cable.${hue}`, points, r, { owner: `stand.cable.${hue}`, limp: true });
    put({ name: `stand.cable.${hue}`, layer: "back", at: points[Math.floor(points.length / 2)], svg, shapes: [A.tube(points, r, { name: `stand.cable.${hue}` })] });
  });
}

// A lamp in front of the turntable (front layer).
const LAMP = polar(18, 86);
cylinder("stand.lamp.post", "front", LAMP, 1.6, 0, 44, { tone: "mid" }, "steel");
cylinder("stand.lamp.head", "front", LAMP, 6, 44, 5, { tone: "hi" }, "brass");

// ---------------------------------------------------------------------------
export const out = T.build({ statics: R.items, poses, verify: VERIFY });
A.settle(R, P);

if (MAIN) main();

function main() {
  if (has("--audit")) {
    A.auditOrExit(R, P);
    const only = FLAGS.find((flag) => flag.startsWith("--only="));
    TA.orbitOrExit(T, R, P, {
      sweep: { at: (x) => follow({ table: x }), from: 0, to: 360, frame: 0.3 },
      clips: [{ name: "flex", at: (t) => follow({ table: 20 + 14 * t, lift: 1, time: t }), from: 0, to: 4, frame: 1 / 60 }],
      quick: has("--quick"),
      only: only ? only.slice(7).split(",").filter(Boolean) : null,
      log: has("--verbose") ? (text) => console.log(`  … ${text}`) : null,
    });
  }
  const file = `turning-stress${VERIFY ? "-verify" : ""}${LIGHT ? "-light" : ""}.html`;
  const html = page();
  writeFileSync(join(HERE, file), html);
  const layers = out.report.layers.map((layer) => `${layer.name}: ${layer.planar} planes, ${layer.dynamic} dynamic`).join(" · ");
  const kb = (text) => Math.round(Buffer.byteLength(text) / 1024);
  console.log(`wrote ${file} · ${kb(html)} KB · ${out.report.parts} parts · ${T.routes.length} routes · ${out.report.groups} groups · ${layers} · ${out.report.proofs.length} layer proofs · data ${kb(JSON.stringify(out.data))} KB · build ${out.report.seconds.toFixed(1)} s`);
}

function layerMarkup(name) {
  return R.items.filter((item) => item.layer === name).sort((a, b) => a.key - b.key).map((item) => item.svg).join("");
}

function page() {
  const label = "Stress scene: a dense robot hand of hinged finger chains on a turntable, among static workshop clutter on a bench.";
  const back = k.figureSvg({ width: W, height: H, label, body: layerMarkup("back") });
  const front = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg iso-layer" viewBox="0 0 ${W} ${H}" aria-hidden="true">${layerMarkup("front")}</svg>`;
  const stage = `<div class="iso-stage iso-turn ts-stage" tabindex="0" role="img" aria-label="${label} The turntable turns on its own; this page is a performance test with no controls.">${back}${out.layerSvg("hand", { width: W, height: H })}${front}</div>`;
  const body = k.plateHtml({
    fig: "Fig 3D·S",
    title: "Stress hand",
    hint: "Tour only",
    readout: `${out.report.parts} live parts`,
    caption: "A stress scene for the 3D mode: a dense hand built from chains of hinges rides a turntable while static workshop clutter stays put around it. It measures cost, not correctness.",
    body: `<style>${out.css}\n.ts-stage{outline:none}</style>${stage}`,
  });
  const hook = VERIFY ? `window.__isoVerify = ${JSON.stringify(out.verify)};\n` : "";
  const loop = `
const DATA = ${JSON.stringify({ turn: out.data })};
${follow.toString()}
const stage = document.querySelector(".ts-stage");
const calm = matchMedia("(prefers-reduced-motion: reduce)");
let touring = !calm.matches;
const controller = TURN.mount(stage, DATA.turn, { follow, onHold: () => { touring = false; } });
let angle = 0, time = 0, last = 0, frame = 0, visible = false, average = 0, half = false, skip = false;
function tick(now) {
  frame = 0;
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
  last = now;
  if (!touring || calm.matches) return;
  angle += 14 * dt;
  time += dt;
  skip = half && !skip;
  if (!skip) {
    const started = performance.now();
    controller.set({ table: angle, lift: 1, time });
    const spent = performance.now() - started;
    average = average ? average * 0.9 + spent * 0.1 : spent;
    if (average > 14) half = true;
    else if (average < 9) half = false;
  }
  if (visible && touring) frame = requestAnimationFrame(tick);
}
const run = () => { if (!frame && visible && touring && !calm.matches) { last = 0; frame = requestAnimationFrame(tick); } };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
const onCalm = () => { if (calm.matches) touring = false; };
if (calm.addEventListener) calm.addEventListener("change", onCalm);
`;
  return k.pageHtml({ title: "Stress hand", theme: LIGHT ? "light" : "dark", width: W + 40, body, script: turnScript() + hook + loop });
}
