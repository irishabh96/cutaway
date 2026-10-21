// A dial test indicator on a surface plate. The carriage slides on two rails and
// carries three gauge blocks; the plunger rests on whatever is beneath its tip and
// the needle turns once for every 20 px the plunger rises.
//   node build.mjs           -> dial-indicator.html
//   node build.mjs --light   -> dial-indicator-light.html
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";

const OUT_DIR = dirname(fileURLToPath(import.meta.url));
const LIGHT = process.argv.includes("--light");
const WIDTH = 600;
const HEIGHT = 380;

// World layout (units; z up). The tip of the plunger sits at x = TIP, y = 0.
const PLATE = { x: -150, y: -62, w: 300, d: 124, r: 8 };
const TIP = 60;
const TIP_R = 1.4;
const TURN = 20; // plunger travel for one full needle turn
const RAIL_TOP = 3;
const DECK = 8; // carriage top
const SLIDE = { x: -30, y: -26, w: 60, d: 52, r: 3 };
const BLOCKS = [
  { at: -18, height: 18 },
  { at: 0, height: 14 },
  { at: 18, height: 10 },
].map((block) => ({ ...block, plan: { x: block.at - 5, y: -9, w: 10, d: 18, r: 0.6 } }));
const STOPS = BLOCKS.map((block) => TIP - block.at); // block 1 has the largest x
const REACH = [Math.min(...STOPS) - 4, Math.max(...STOPS) + 4];
const DIAL = { x: TIP, y: 0, r: 20, z: 52, h: 10 };
const FACE = DIAL.z + DIAL.h;
const POST = { x: -84, y: 0, r: 3.4, top: 88 };
const CLAMP = { z: 54, h: 12 };

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -17, 0), [POST.x, POST.y, POST.top + 2], [DIAL.x - DIAL.r, 0, FACE], [DIAL.x, -DIAL.r, FACE]],
  WIDTH,
  HEIGHT,
  { pad: 30 },
);
const at = (point) => k.iso(point, P);
const solid = (paths, style) => k.solidSvg(paths, style);
const line = (d, style) => k.lineSvg(d, style);
const dots = (points, style) => k.dotsSvg(points.map(at), style);
const nearFirst = (points) => [...points].sort((a, b) => k.depthOf([...a, 0], P) - k.depthOf([...b, 0], P));
const screws = (plan, inset, z, radius = 2) =>
  line(k.corners(plan, inset).map(([x, y]) => k.ring(x, y, radius, z, P, 16)).join(""), { tone: "lo" }) +
  dots(k.corners(plan, inset).map(([x, y]) => [x, y, z]), { size: 0.5 });

// ---- surface plate --------------------------------------------------------
const plate = [`<path class="iso-halo" d="${k.haloOf(PLATE, -17, 12, P)}"/>`];
for (const [x, y] of nearFirst(k.corners(PLATE, 22))) {
  plate.push(solid(k.cylinder(x, y, 7, -17, 1.6, P, 28), { tone: "lo" }));
  plate.push(solid(k.cylinder(x, y, 5.4, -15.4, 3.4, P, 28), { tone: "mid" }));
}
plate.push(solid(k.slabOf(PLATE, -12, 12, P, 8, 1.6), { tone: "mid" }));
plate.push(line(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "faint" }));
plate.push(screws(PLATE, 10, 0, 2.2));
const RULER = { x: PLATE.x + 16, y: PLATE.y + PLATE.d - 14, w: PLATE.w - 32, d: 7, r: 1 };
const ticks = k.topTicks(RULER.x + 4, RULER.x + RULER.w - 4, 4, 5, RULER.y, 0.6, [2, 3.6], P);
plate.push(solid(k.slabOf(RULER, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
plate.push(line(ticks.minor, { tone: "lo" }), line(ticks.major, { tone: "mid" }));
plate.push(dots([[RULER.x + 1.6, RULER.y + RULER.d / 2, 0.6], [RULER.x + RULER.w - 1.6, RULER.y + RULER.d / 2, 0.6]], { size: 0.45 }));

// ---- rails and end stops -------------------------------------------------
const rails = [];
for (const y of [-22, 17]) rails.push(solid(k.slabOf({ x: 2, y, w: 138, d: 5, r: 1 }, 0, RAIL_TOP, P, 3, 0.4), { tone: "mid" }));
for (const x of [-4, 140]) {
  const stop = { x, y: -25, w: 6, d: 50, r: 1.2 };
  rails.push(solid(k.slabOf(stop, 0, 7, P, 3, 0.5), { tone: "mid" }));
  rails.push(dots([[x + 3, -17, 7], [x + 3, 17, 7]], { size: 0.5 }));
}

// ---- fixture: magnetic base, post, clamp and arm ---------------------------
const BASE = { x: -106, y: -22, w: 50, d: 44, r: 3 };
const TOWER = { x: -102, y: -18, w: 34, d: 36, r: 2.5 };
const KNOB = { x: -62, y: 0, r: 5 };
const fixture = [`<path class="iso-halo" d="${k.haloOf(BASE, 0, 10, P)}"/>`];
fixture.push(solid(k.slabOf(BASE, 0, 10, P, 4, 0.8), { tone: "mid" }));
fixture.push(solid(k.slabOf(TOWER, 10, 10, P, 4, 0.6), { tone: "mid" }));
fixture.push(solid(k.cylinder(KNOB.x, KNOB.y, KNOB.r, 10, 4, P, 32), { tone: "mid" }));
fixture.push(line(k.knurl(KNOB.x, KNOB.y, KNOB.r, 10, 14, 36, P), { tone: "lo" }));
fixture.push(line(k.lineOnTop([KNOB.x - KNOB.r, KNOB.y], [KNOB.x + KNOB.r, KNOB.y], 14, P), { tone: "hi" }));
fixture.push(solid(k.cylinder(POST.x, POST.y, 5, 20, 3, P, 28), { tone: "mid" }));
fixture.push(solid(k.cylinder(POST.x, POST.y, POST.r, 23, CLAMP.z - 23, P, 28), { tone: "mid", crease: "none" }));
const CLAMP_PLAN = { x: POST.x - 7, y: -7, w: 14, d: 14, r: 2.5 };
fixture.push(solid(k.slabOf(CLAMP_PLAN, CLAMP.z, CLAMP.h, P, 4, 0.6), { tone: "mid" }));
fixture.push(solid(k.slabOf({ x: POST.x - 1.4, y: 7, w: 2.8, d: 3, r: 0.4 }, CLAMP.z + 4.5, 3, P, 2), { tone: "mid" }));
fixture.push(solid(k.cylinder(POST.x, 12.6, 2.6, CLAMP.z + 3, 6, P, 24), { tone: "mid" }));
fixture.push(line(k.knurl(POST.x, 12.6, 2.6, CLAMP.z + 3, CLAMP.z + 9, 18, P), { tone: "lo" }));
const upper = CLAMP.z + CLAMP.h;
fixture.push(solid(k.cylinder(POST.x, POST.y, POST.r, upper, POST.top - upper, P, 28), { tone: "mid" }));
fixture.push(line(k.sideArc(POST.x, POST.y, POST.r, POST.top - 6, P, 16), { tone: "faint" }));
fixture.push(solid(k.cylinder(POST.x, POST.y, 4, POST.top, 2, P, 28), { tone: "mid" }));
const ARM = { x: CLAMP_PLAN.x + CLAMP_PLAN.w, y: -3, w: DIAL.x - DIAL.r - 2 - (CLAMP_PLAN.x + CLAMP_PLAN.w), d: 6, r: 1 };
const arm = solid(k.slabOf(ARM, CLAMP.z + 3, 6, P, 3, 0.4), { tone: "mid" });

// ---- carriage and gauge blocks (built at x = 0, moved along x) ------------
const carriage = [`<path class="iso-halo" d="${k.haloOf(SLIDE, RAIL_TOP - 3, 3, P)}"/>`];
carriage.push(solid(k.slabOf(SLIDE, RAIL_TOP, DECK - RAIL_TOP, P, 5, 0.6), { tone: "mid" }));
carriage.push(line([-19.5, 19.5].map((y) => k.lineOnTop([SLIDE.x, y], [SLIDE.x + SLIDE.w, y], DECK, P)).join(""), { tone: "faint" }));
carriage.push(dots(k.corners(SLIDE, 4).map(([x, y]) => [x, y, DECK]), { size: 0.5 }));
carriage.push(solid(k.slabOf({ x: -2, y: SLIDE.y + SLIDE.d, w: 4, d: 3, r: 0.5 }, RAIL_TOP + 1, 3, P, 2), { tone: "mid" }));
carriage.push(solid(k.cylinder(0, SLIDE.y + SLIDE.d + 5.4, 3, RAIL_TOP, 6, P, 28), { tone: "mid" }));
carriage.push(line(k.knurl(0, SLIDE.y + SLIDE.d + 5.4, 3, RAIL_TOP, RAIL_TOP + 6, 22, P), { tone: "lo" }));
const blocks = BLOCKS.map((block) => solid(k.slabOf(block.plan, DECK, block.height, P, 2, 0.4), { tone: "hi", crease: "lo" }));

// ---- plunger (built resting on the deck, raised by its height) ------------
const plunger = [
  solid(k.cylinder(TIP, 0, 0.8, DECK + 2, 34, P, 16), { tone: "hi", lit: true, crease: "none" }),
  solid(k.cylinder(TIP, 0, TIP_R, DECK, 2.4, P, 20), { tone: "hi", lit: true }),
];

// ---- dial ------------------------------------------------------------------
const dial = [];
dial.push(solid(k.slabOf({ x: ARM.x + ARM.w - 0.5, y: -4, w: 4, d: 8, r: 1 }, CLAMP.z + 2, 8, P, 2, 0.3), { tone: "mid" }));
dial.push(solid(k.cylinder(DIAL.x, DIAL.y, 3.2, 36, DIAL.z - 36, P, 24), { tone: "mid" }));
dial.push(solid(k.cylinder(DIAL.x, DIAL.y, 5, DIAL.z - 3, 3, P, 28), { tone: "mid" }));
dial.push(solid(k.cylinder(DIAL.x, DIAL.y, DIAL.r, DIAL.z, DIAL.h, P, 64, 0.8), { tone: "hi", crease: "lo" }));
dial.push(line(k.knurl(DIAL.x, DIAL.y, DIAL.r, FACE - 3.4, FACE, 84, P, 0.3), { tone: "lo" }));
dial.push(line(k.sideArc(DIAL.x, DIAL.y, DIAL.r, FACE - 3.4, P, 40), { tone: "faint" }));
dial.push(line(k.ring(DIAL.x, DIAL.y, DIAL.r - 1.4, FACE, P, 64), { tone: "lo" }));
dial.push(line(k.ring(DIAL.x, DIAL.y, DIAL.r - 3, FACE, P, 64), { tone: "lo" }));
const dialTicks = k.radialTicks(DIAL.x, DIAL.y, DIAL.r - 3, 50, 5, FACE, [1.3, 2.8], P);
dial.push(line(dialTicks.minor, { tone: "lo" }), line(dialTicks.major, { tone: "mid" }));
dial.push(k.faceTextSvg(k.topMatrix([DIAL.x - 2.6, DIAL.y + 9], FACE, P), "0.01", { size: 2.4, tone: "lo" }));
dial.push(line(k.ring(DIAL.x, DIAL.y, 1.6, FACE, P, 16), { tone: "mid" }));

const NEEDLE = { tail: 3, reach: DIAL.r - 5, z: FACE + 0.2 };
const needleAt = (turns) => {
  const a = turns * Math.PI * 2;
  const [sx, sy] = [Math.sin(a), -Math.cos(a)];
  return k.lineOnTop([DIAL.x - sx * NEEDLE.tail, DIAL.y - sy * NEEDLE.tail], [DIAL.x + sx * NEEDLE.reach, DIAL.y + sy * NEEDLE.reach], NEEDLE.z, P);
};
const START = 0; // block 1
const rest = BLOCKS[START].height;
const moveX = k.translateAlong(P, [STOPS[START], 0, 0]);
// Blocks whose near half has passed the tip are drawn over the plunger (the page re-orders them as they move).
const behind = BLOCKS.filter((block) => STOPS[START] + block.at - 5 <= TIP + TIP_R).length;
const blockGroups = blocks.map((block, index) => `<g data-part="block" data-block="${index + 1}" transform="${moveX}">${block}</g>`);
const needle = `<path class="iso-line di-needle" data-tone="lit" data-free="start" data-part="needle" d="${needleAt(rest / TURN)}"/>`;

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A dial indicator on a surface plate: a magnetic base with a post and arm holds a dial whose plunger rests on three gauge blocks, 18, 14 and 10 tall, standing on a carriage that slides along two rails. The needle turns as the plunger rises.",
  body: [
    ...plate,
    ...rails,
    ...fixture,
    `<g data-part="carriage" transform="${moveX}">${carriage.join("")}</g>`,
    ...blockGroups.slice(0, behind),
    `<g data-part="plunger" transform="${k.translateAlong(P, [0, 0, rest])}">${plunger.join("")}</g>`,
    ...blockGroups.slice(behind),
    arm,
    ...dial,
    needle,
  ],
});

const readout = (index, height) => `${index < 0 ? "between blocks" : `block ${index + 1}`} · reads ${height.toFixed(1)} px`;
const LIVE = `
const P = ${JSON.stringify(P)};
const C = ${JSON.stringify({ TIP, TIP_R, TURN, DIAL, NEEDLE, STOPS, REACH, START, BLOCKS: BLOCKS.map(({ at, height }) => ({ at, height })) })};
const still = matchMedia("(prefers-reduced-motion: reduce)");
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const say = document.querySelector("[data-readout]");
const car = stage.querySelector('[data-part="carriage"]');
const blockEls = [...stage.querySelectorAll('[data-part="block"]')];
const plunger = stage.querySelector('[data-part="plunger"]');
const needle = stage.querySelector('[data-part="needle"]');
const s = { x: C.STOPS[C.START], target: C.STOPS[C.START], tip: C.BLOCKS[C.START].height, rate: 0, behind: -1, text: "" };
s.behind = blockEls.filter((el) => el.compareDocumentPosition(plunger) & Node.DOCUMENT_POSITION_FOLLOWING).length;
// Blocks are 10 wide with 8 between them, so at most one is ever under the tip.
const under = (x) => C.BLOCKS.findIndex((b) => Math.abs(C.TIP - x - b.at) < 5 + C.TIP_R);
const heightUnder = (x) => (under(x) < 0 ? 0 : C.BLOCKS[under(x)].height);
const needleAt = (turns) => {
  const a = turns * Math.PI * 2, sx = Math.sin(a), sy = -Math.cos(a), n = C.NEEDLE;
  return lineOnTop([C.DIAL.x - sx * n.tail, C.DIAL.y - sy * n.tail], [C.DIAL.x + sx * n.reach, C.DIAL.y + sy * n.reach], n.z, P);
};
function spring(goal, dt, calm) {
  if (calm) { s.tip = goal; s.rate = 0; return; }
  const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
  for (let i = 0; i < n; i++) {
    s.rate += (420 * (goal - s.tip) - 26 * s.rate) * h;
    s.tip += s.rate * h;
    if (s.tip < goal && s.rate < 0) { s.tip = goal; s.rate = 0; }
  }
  if (Math.abs(goal - s.tip) < 5e-4 && Math.abs(s.rate) < 5e-4) { s.tip = goal; s.rate = 0; }
}
function draw() {
  const move = translateAlong(P, [s.x, 0, 0]);
  car.setAttribute("transform", move);
  blockEls.forEach((el) => el.setAttribute("transform", move));
  const behind = C.BLOCKS.filter((b) => s.x + b.at - 5 <= C.TIP + C.TIP_R).length;
  if (behind !== s.behind) {
    s.behind = behind;
    if (behind < blockEls.length) blockEls[behind].before(plunger); else blockEls[blockEls.length - 1].after(plunger);
  }
  const h = Math.max(0, s.tip);
  plunger.setAttribute("transform", translateAlong(P, [0, 0, h]));
  needle.setAttribute("d", needleAt(h / C.TURN));
  const text = (under(s.x) < 0 ? "between blocks" : "block " + (under(s.x) + 1)) + " · reads " + h.toFixed(1) + " px";
  if (text !== s.text) {
    s.text = text;
    say.textContent = text;
    stage.setAttribute("aria-valuenow", String(Math.round(h)));
    stage.setAttribute("aria-valuetext", (under(s.x) < 0 ? "Between blocks" : "Block " + (under(s.x) + 1)) + ", the dial reads " + h.toFixed(1) + " pixels");
  }
}
let frame = 0, last = 0, visible = false, clock = 0, touring = !still.matches, resume = 0;
const tourAt = (t) => C.STOPS[Math.floor(t / 2.4) % C.STOPS.length];
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (touring) { clock += dt; s.target = tourAt(clock); }
  s.x = calm ? s.target : s.x + (s.target - s.x) * (1 - Math.exp(-dt / 0.28));
  if (Math.abs(s.x - s.target) < 5e-4) s.x = s.target;
  spring(heightUnder(s.x), dt, calm);
  draw();
  const settled = !touring && s.x === s.target && s.rate === 0 && s.tip === heightUnder(s.x);
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
function hold() {
  touring = false;
  clearTimeout(resume);
  if (!still.matches) resume = setTimeout(() => { touring = true; clock = 0; run(); }, 3600);
}
stage.addEventListener("pointermove", (event) => {
  const box = svg.getBoundingClientRect();
  const share = Math.min(1, Math.max(0, ((event.clientX - box.left) / box.width - 0.25) / 0.5));
  s.target = C.REACH[0] + share * (C.REACH[1] - C.REACH[0]);
  hold();
  run();
});
stage.addEventListener("keydown", (event) => {
  const nearest = C.STOPS.reduce((best, x, i) => (Math.abs(x - s.target) < Math.abs(C.STOPS[best] - s.target) ? i : best), 0);
  const end = C.STOPS.length - 1;
  const to = { ArrowRight: nearest - 1, ArrowUp: nearest - 1, ArrowLeft: nearest + 1, ArrowDown: nearest + 1, Home: 0, End: end }[event.key];
  if (to === undefined) return;
  event.preventDefault();
  s.target = C.STOPS[Math.max(0, Math.min(end, to))];
  hold();
  run();
});
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: "Dial indicator",
  hint: "Hover to slide the carriage",
  readout: readout(START, rest),
  keys: [
    { mark: "lit", label: "Plunger and needle: they move when the height changes" },
    { mark: "raised", label: "Three gauge blocks, 18, 14 and 10 tall" },
  ],
  caption:
    "A dial indicator stands on a surface plate. Slide the carriage and the plunger rides up onto the block beneath it. One turn of the needle is 20 px of travel, so each block reads its own height.",
  body: `<style>.di-stage{outline:none;border-radius:10px;touch-action:pan-y}.di-stage:focus-visible{outline:1px solid var(--cutaway-muted);outline-offset:6px}.di-needle{stroke-width:1.1}</style><div class="iso-stage di-stage" tabindex="0" role="slider" aria-label="Dial indicator. Arrow keys move the carriage from block to block; Home and End go to the first and last block." aria-valuemin="0" aria-valuemax="18" aria-valuenow="${rest}" aria-valuetext="Block 1, the dial reads ${rest.toFixed(1)} pixels">${svg}</div>`,
});

const file = LIGHT ? "dial-indicator-light.html" : "dial-indicator.html";
writeFileSync(join(OUT_DIR, file), k.pageHtml({ title: "Dial indicator", theme: LIGHT ? "light" : "dark", body, script: kitScript() + LIVE }));
console.log(`wrote ${file}`);
