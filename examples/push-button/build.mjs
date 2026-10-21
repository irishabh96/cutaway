// A momentary push button wired in a loop with a 1.5 V cell and a small bulb.
// A spring holds the copper bridge 7 px above two contact posts; pressing the cap
// lands it on both, closes the loop and lights the bulb.
//   node build.mjs           -> push-button.html
//   node build.mjs --light   -> push-button-light.html
// When push-button-poster-a4.pdf exists here (scripts/print.mjs sheet.mjs), the
// page carries a PDF link: build the light page, print, then build again.
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { pdfButton } from "../../kit/pdf-button.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";

const OUT_DIR = dirname(fileURLToPath(import.meta.url));
const LIGHT = process.argv.includes("--light");
const PDF = "push-button-poster-a4.pdf";
const WIDTH = 600;
const HEIGHT = 380;

const PLATE = { x: -130, y: -62, w: 260, d: 124, r: 8 };
const SW = [0, 20]; // switch centre
const CELL = [-86, -18];
const BULB = [82, -24];
const GAP = 7; // bridge travel to contact
const Z = { base: 6, post: 15.5, bridge: 15.5 + GAP, plateLow: 40, plateTop: 43, cap: 58, capH: 6 };
const BAR = 1.5; // bridge thickness
const SPRING = { r: 3.6, rings: 6 };
const GLOBE = { z: 25, r: 10 };
const VOLTS = 1.5;
const AMPS = 0.3;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -17, 0), [SW[0], SW[1], Z.cap + Z.capH], [BULB[0], BULB[1], GLOBE.z + GLOBE.r], [CELL[0], CELL[1], 34]],
  WIDTH,
  HEIGHT,
  { pad: 30 },
);
const at = (point) => k.iso(point, P);
const solid = (paths, style) => k.solidSvg(paths, style);
const line = (d, style) => k.lineSvg(d, style);
const dots = (points, style) => k.dotsSvg(points.map(at), style);
const halo = (plan, z, h) => `<path class="iso-halo" d="${k.haloOf(plan, z, h, P)}"/>`;
const around = ([cx, cy], x, y, w, d, r = 1) => ({ x: cx + x, y: cy + y, w, d, r });
const piece = (id, parts) => `<g data-piece="${id}">${parts.join("")}</g>`;
const terminal = ([x, y], z) => line(k.ring(x, y, 1.8, z, P, 16), { tone: "lo" }) + dots([[x, y, z]], { size: 0.55, tone: "hi" });
const nearFirst = (points) => [...points].sort((a, b) => k.depthOf([...a, 0], P) - k.depthOf([...b, 0], P));

// ---- bench plate -----------------------------------------------------------
const bench = [halo(PLATE, -17, 12)];
for (const [x, y] of nearFirst(k.corners(PLATE, 22))) {
  bench.push(solid(k.cylinder(x, y, 7, -17, 1.6, P, 28), { tone: "lo" }));
  bench.push(solid(k.cylinder(x, y, 5.4, -15.4, 3.4, P, 28), { tone: "mid" }));
}
bench.push(solid(k.slabOf(PLATE, -12, 12, P, 8, 1.6), { tone: "mid" }));
bench.push(line(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "faint" }));
bench.push(line(k.corners(PLATE, 10).map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
bench.push(dots(k.corners(PLATE, 10).map(([x, y]) => [x, y, 0]), { size: 0.5 }));
const RULER = { x: PLATE.x + 16, y: PLATE.y + PLATE.d - 14, w: PLATE.w - 32, d: 7, r: 1 };
const ticks = k.topTicks(RULER.x + 4, RULER.x + RULER.w - 4, 4, 5, RULER.y, 0.6, [2, 3.6], P);
bench.push(solid(k.slabOf(RULER, 0, 0.6, P, 3), { tone: "lo", crease: "none" }), line(ticks.minor, { tone: "lo" }), line(ticks.major, { tone: "mid" }));
const LABEL = { x: -122, y: 14, w: 36, d: 18, r: 1.4 };
bench.push(solid(k.slabOf(LABEL, 0, 0.8, P, 4), { tone: "lo" }));
bench.push(line(k.planOutline(k.insetPlan(LABEL, 1.6), 0.8, P), { tone: "faint" }));
bench.push(k.faceTextSvg(k.topMatrix([LABEL.x + 4.4, LABEL.y + 11.6], 0.8, P), `${VOLTS} V · ${AMPS} A`, { size: 3.4, tone: "mid" }));
bench.push(dots([[LABEL.x + 3, LABEL.y + 3.2, 0.8], [LABEL.x + LABEL.w - 3, LABEL.y + 3.2, 0.8]], { size: 0.45 }));

// ---- glow under the bulb (opacity comes from --pb-glow on the stage) ------
const [gx, gy] = at([BULB[0], BULB[1], GLOBE.z]);
const glow = `<defs><radialGradient id="pb-glow-fill"><stop offset="0" style="stop-color:var(--pb-amber)" stop-opacity=".9"/><stop offset=".35" style="stop-color:var(--pb-amber)" stop-opacity=".38"/><stop offset="1" style="stop-color:var(--pb-amber)" stop-opacity="0"/></radialGradient></defs><circle class="pb-glow" cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="78" fill="url(#pb-glow-fill)"/>`;

// ---- feet of each assembly: holder, bulb base, switch base -----------------
const HOLDER = around(CELL, -15, -15, 30, 30, 2.5);
const SOCKET_BASE = around(BULB, -13, -13, 26, 26, 2.5);
const BASE = around(SW, -28, -12, 56, 24, 2.5);
const T = {
  cellPlus: [CELL[0] + 13, CELL[1] - 4],
  cellMinus: [CELL[0] + 6, CELL[1] + 11],
  bulbIn: [BULB[0] - 9, BULB[1] + 3],
  bulbOut: [BULB[0] + 3, BULB[1] + 9],
  postA: [SW[0] + 9, SW[1] + 7.5],
  postB: [SW[0] - 9, SW[1] + 7.5],
};
const holder = [halo(HOLDER, 0, 4), solid(k.slabOf(HOLDER, 0, 4, P, 4, 0.6), { tone: "mid" })];
holder.push(line(k.ring(CELL[0], CELL[1], 10.4, 4, P, 40), { tone: "faint" }));
holder.push(terminal(T.cellPlus, 4), terminal(T.cellMinus, 4));
const bulbBase = [halo(SOCKET_BASE, 0, 4), solid(k.slabOf(SOCKET_BASE, 0, 4, P, 4, 0.6), { tone: "mid" })];
bulbBase.push(terminal(T.bulbIn, 4), terminal(T.bulbOut, 4));
const base = [halo(BASE, 0, Z.base), solid(k.slabOf(BASE, 0, Z.base, P, 4, 0.8), { tone: "mid" })];
base.push(line(k.planOutline(k.insetPlan(BASE, 2.6), Z.base, P), { tone: "faint" }));
base.push(terminal(T.postA, Z.base), terminal(T.postB, Z.base));

// ---- wires, low on the bench, terminal to terminal ------------------------
const wire = (from, fromZ, to, toZ, via) => k.wireSvg(at([...from, fromZ]), at([...to, toZ]), { via: via.map(at), tone: "mid", size: 1 });
// Each run climbs off its terminal over the nearest edge, crosses the bench and climbs back up.
const front = BASE.y + BASE.d;
const lane = front + 6;
const wires = [
  wire(T.cellPlus, 4, T.bulbIn, 4, [
    [HOLDER.x + HOLDER.w - 0.3, T.cellPlus[1], 4], [HOLDER.x + HOLDER.w + 0.6, T.cellPlus[1], 0.5],
    [SOCKET_BASE.x - 0.6, T.bulbIn[1], 0.5], [SOCKET_BASE.x + 0.3, T.bulbIn[1], 4],
  ]),
  wire(T.bulbOut, 4, T.postA, Z.base, [
    [T.bulbOut[0], SOCKET_BASE.y + SOCKET_BASE.d - 0.3, 4], [T.bulbOut[0], SOCKET_BASE.y + SOCKET_BASE.d + 0.6, 0.5],
    [T.bulbOut[0], lane, 0.5], [T.postA[0], lane, 0.5], [T.postA[0], front + 0.6, 0.5], [T.postA[0], front - 0.3, Z.base],
  ]),
  wire(T.postB, Z.base, T.cellMinus, 4, [
    [T.postB[0], front - 0.3, Z.base], [T.postB[0], front + 0.6, 0.5], [T.postB[0], lane, 0.5],
    [T.cellMinus[0], lane, 0.5], [T.cellMinus[0], HOLDER.y + HOLDER.d + 0.6, 0.5], [T.cellMinus[0], HOLDER.y + HOLDER.d - 0.3, 4],
  ]),
];

// ---- cell ---------------------------------------------------------------------
const CELL_TOP = 30;
const cell = [];
cell.push(solid(k.cylinder(CELL[0], CELL[1], 9, 4, CELL_TOP - 4, P, 40, 0.6), { tone: "mid" }));
cell.push(line(k.sideArc(CELL[0], CELL[1], 9, 8, P, 24) + k.sideArc(CELL[0], CELL[1], 9, CELL_TOP - 4, P, 24), { tone: "faint" }));
cell.push(k.faceTextSvg(k.topMatrix([CELL[0] - 6.2, CELL[1] + 5.4], CELL_TOP, P), `${VOLTS} V`, { size: 3.2, tone: "mid" }));
cell.push(solid(k.cylinder(CELL[0], CELL[1], 2.8, CELL_TOP, 2, P, 20), { tone: "hi" }));
// The strap: across the top from the + terminal, down the near side, to the holder terminal.
cell.push(solid(k.slabOf({ x: CELL[0] + 2, y: CELL[1] - 5, w: 7.6, d: 2, r: 0.3 }, CELL_TOP, 0.5, P, 1), { tone: "hi", crease: "none" }));
cell.push(solid(k.slabOf({ x: CELL[0] + 8.6, y: CELL[1] - 5, w: 0.8, d: 2, r: 0.2 }, 4, CELL_TOP - 3.5, P, 1), { tone: "hi", crease: "none" }));
cell.push(solid(k.slabOf({ x: CELL[0] + 8.6, y: CELL[1] - 5, w: 2.8, d: 2, r: 0.3 }, 4, 0.5, P, 1), { tone: "hi", crease: "none" }));

// ---- bulb ---------------------------------------------------------------------
const bulb = [];
bulb.push(solid(k.cylinder(BULB[0], BULB[1], 6, 4, 2.4, P, 32), { tone: "mid" }));
bulb.push(solid(k.cylinder(BULB[0], BULB[1], 5, 6.4, 10, P, 32, 0.4), { tone: "mid" }));
bulb.push(line([8.6, 10.6, 12.6, 14.4].map((z) => k.sideArc(BULB[0], BULB[1], 5, z, P, 20)).join(""), { tone: "lo" }));
const [bx, by] = at([BULB[0], BULB[1], GLOBE.z]);
const globeR = GLOBE.r * Math.hypot(...k.axisVector(P, [Math.SQRT1_2, -Math.SQRT1_2, 0]));
bulb.push(`<circle class="pb-glass" cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${globeR.toFixed(2)}"/>`);
const across = (u, z) => at([BULB[0] + u * Math.SQRT1_2, BULB[1] - u * Math.SQRT1_2, z]);
const feet = [across(-1.4, 17.4), across(1.4, 17.4)];
const tops = [across(-3.8, GLOBE.z + 1.5), across(3.8, GLOBE.z + 1.5)];
bulb.push(line(k.pathOf([feet[0], tops[0]]) + k.pathOf([feet[1], tops[1]]), { tone: "mid" }));
bulb.push(k.dotsSvg(feet, { size: 0.7, tone: "mid" }));
const zig = Array.from({ length: 9 }, (_, i) => across(-3.8 + (7.6 * i) / 8, GLOBE.z + 1.5 + (i % 2 ? 1.2 : 0)));
bulb.push(line(k.pathOf(zig), { tone: "hi", className: "pb-filament", free: true }));
const glint = Array.from({ length: 7 }, (_, i) => {
  const a = Math.PI * (1.12 + (0.3 * i) / 6);
  return [bx + Math.cos(a) * globeR * 0.66, by + Math.sin(a) * globeR * 0.66];
});
bulb.push(line(k.pathOf(glint), { tone: "lo", className: "pb-glint", free: true }));
bulb.push(`<circle class="pb-glass-edge" cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${globeR.toFixed(2)}"/>`);

// ---- switch: posts, open frame, bridge, spring, cap -----------------------
const contacts = [];
for (const dx of [-9, 9]) {
  contacts.push(solid(k.cylinder(SW[0] + dx, SW[1], 2.4, Z.base, Z.post - Z.base - 1.5, P, 24), { tone: "mid" }));
  contacts.push(solid(k.cylinder(SW[0] + dx, SW[1], 3, Z.post - 1.5, 1.5, P, 24), { tone: "hi", crease: "lo" }));
}
const column = (dx) => solid(k.slabOf(around(SW, dx - 3, -3, 6, 6, 0.8), Z.base, Z.plateLow - Z.base, P, 2, 0.4), { tone: "mid" });
const TOP_PLATE = around(SW, -24, -5, 48, 10, 1.4);
const topPlate = [
  solid(k.slabOf(TOP_PLATE, Z.plateLow, Z.plateTop - Z.plateLow, P, 3, 0.4), { tone: "mid" }),
  line(k.ring(SW[0], SW[1], 2.2, Z.plateTop, P, 20), { tone: "lo" }),
  dots([[SW[0] - 20, SW[1], Z.plateTop], [SW[0] + 20, SW[1], Z.plateTop]], { size: 0.5 }),
];
// Static clips: the stem shows below the top plate on the bridge, above it on the cap.
const clipBelow = k.cylinder(SW[0], SW[1], 2.2, Z.base, Z.plateLow - Z.base, P, 20).fill;
const clipAbove = k.cylinder(SW[0], SW[1], 2.2, Z.plateTop, 40, P, 20).fill;
const bridge = [
  solid(k.cylinder(SW[0], SW[1], 1.3, Z.bridge + BAR, 26, P, 16), { tone: "hi", lit: true, crease: "none" }),
];
const bar = solid(k.slabOf(around(SW, -12, -2.5, 24, 5, 0.6), Z.bridge, BAR, P, 2), { tone: "hi", lit: true, crease: "lo" });
const capStem = solid(k.cylinder(SW[0], SW[1], 1.3, Z.cap - 22, 22, P, 16), { tone: "hi", lit: true, crease: "none" });
const cap = [
  solid(k.cylinder(SW[0], SW[1], 5.6, Z.cap, Z.capH, P, 36, 0.6), { tone: "hi", lit: true, crease: "lo" }),
  line(k.knurl(SW[0], SW[1], 5.6, Z.cap, Z.cap + Z.capH, 40, P), { tone: "lo" }),
  line(k.ring(SW[0], SW[1], 3.2, Z.cap + Z.capH, P, 28), { tone: "faint" }),
];
const coil = (pos) => {
  const top = Z.cap - GAP * pos;
  const levels = Array.from({ length: SPRING.rings }, (_, i) => Z.plateTop + 0.4 + ((top - 0.4 - Z.plateTop - 0.4) * i) / (SPRING.rings - 1));
  return {
    back: levels.map((z) => k.ring(SW[0], SW[1], SPRING.r, z, P, 28)).join(""),
    front: levels.map((z) => k.sideArc(SW[0], SW[1], SPRING.r, z, P, 14)).join(""),
  };
};
const rest = coil(0);

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A bench plate with a push button wired in a loop with a 1.5 volt cell and a small bulb. A spring holds the plunger and its copper bridge 7 units above two contact posts; pressing the button closes the gap and lights the bulb.",
  body: [
    ...bench,
    glow,
    piece("cell", holder),
    piece("bulb", bulbBase),
    piece("frame", base),
    piece("wires", wires),
    piece("cell", cell),
    piece("bulb", bulb),
    piece("frame", [column(-20)]),
    piece("contacts", contacts),
    `<clipPath id="pb-below"><path d="${clipBelow}"/></clipPath><clipPath id="pb-above"><path d="${clipAbove}"/></clipPath>`,
    `<g data-piece="bridge" data-move=""><g clip-path="url(#pb-below)">${bridge.join("")}</g>${bar}</g>`,
    piece("frame", [column(20), ...topPlate]),
    `<g data-piece="spring">${line(rest.back, { tone: "lo", className: "pb-coil-back" })}</g>`,
    `<g clip-path="url(#pb-above)"><g data-piece="cap" data-move="">${capStem}</g></g>`,
    `<g data-piece="spring">${line(rest.front, { tone: "mid", className: "pb-coil-front" })}</g>`,
    `<g data-piece="cap" data-move="">${cap.join("")}</g>`,
  ],
});

const CSS = `
.pb-stage{--pb-glow:0;--pb-amber:#ffb24a;--pb-hot:#ffc266;--pb-warm:#3a2a12;border-radius:10px;cursor:pointer;touch-action:manipulation;outline:none;-webkit-tap-highlight-color:transparent;user-select:none}
.iso[data-theme="light"] .pb-stage{--pb-amber:#f0a030;--pb-hot:#d87a0a;--pb-warm:#fdecc8}
.pb-stage:focus-visible{outline:1px solid var(--cutaway-muted);outline-offset:6px}
.pb-glow{opacity:var(--pb-glow);mix-blend-mode:screen;pointer-events:none}
.iso[data-theme="light"] .pb-glow{mix-blend-mode:multiply}
.pb-glass{fill:var(--cutaway-paper);fill-opacity:.94}
.pb-glass-edge{fill:none;stroke:var(--cutaway-hi);stroke-width:var(--cutaway-weight)}
.pb-stage[data-on] .pb-glass{fill:var(--pb-warm)}
.pb-filament{transition:stroke-width .12s var(--cutaway-ease)}
.pb-stage[data-on] .pb-filament{stroke:var(--pb-hot);stroke-width:1.5}
.pb-stage[data-on] .iso-wire .iso-line{stroke:var(--cutaway-lit)}
.pb-stage[data-on] .iso-wire .iso-wire-end{stroke:var(--cutaway-lit)}
@media (prefers-reduced-motion:reduce){.pb-filament{transition:none}}
`;

const LIVE = `
const P = ${JSON.stringify(P)};
const C = ${JSON.stringify({ GAP, SW, SPRING, Z, VOLTS, AMPS })};
const still = matchMedia("(prefers-reduced-motion: reduce)");
const stage = document.querySelector(".iso-stage");
const say = document.querySelector("[data-readout]");
const movers = [...stage.querySelectorAll("[data-move]")];
const coilBack = stage.querySelector(".pb-coil-back");
const coilFront = stage.querySelector(".pb-coil-front");
const wireLines = [...stage.querySelectorAll('[data-piece="wires"] .iso-line')];
const s = { pos: 0, rate: 0, target: 0, glow: 0, closed: false, text: "", drawn: -1 };
function coilAt(pos) {
  const top = C.Z.cap - C.GAP * pos, low = C.Z.plateTop + 0.4, n = C.SPRING.rings;
  let back = "", front = "";
  for (let i = 0; i < n; i++) {
    const z = low + ((top - 0.4 - low) * i) / (n - 1);
    back += ring(C.SW[0], C.SW[1], C.SPRING.r, z, P, 28);
    front += sideArc(C.SW[0], C.SW[1], C.SPRING.r, z, P, 14);
  }
  return { back, front };
}
function step(dt, calm) {
  if (calm) { s.pos = s.target; s.rate = 0; return; }
  const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
  for (let i = 0; i < n; i++) {
    s.rate += (500 * (s.target - s.pos) - 30 * s.rate) * h;
    s.pos += s.rate * h;
    if (s.pos > 1) { s.pos = 1; s.rate *= -0.25; }
    if (s.pos < 0) { s.pos = 0; s.rate *= -0.25; }
  }
  if (Math.abs(s.target - s.pos) < 5e-4 && Math.abs(s.rate) < 5e-3) { s.pos = s.target; s.rate = 0; }
}
function draw() {
  const closed = s.pos >= 0.97;
  if (s.pos !== s.drawn) {
    s.drawn = s.pos;
    const move = translateAlong(P, [0, 0, -C.GAP * s.pos]);
    movers.forEach((el) => el.setAttribute("transform", move));
    const coil = coilAt(s.pos);
    coilBack.setAttribute("d", coil.back);
    coilFront.setAttribute("d", coil.front);
  }
  if (closed !== s.closed) {
    s.closed = closed;
    stage.toggleAttribute("data-on", closed);
    stage.setAttribute("aria-pressed", String(closed));
    wireLines.forEach((el) => el.toggleAttribute("data-flow", closed));
  }
  stage.style.setProperty("--pb-glow", s.glow.toFixed(3));
  const gap = C.GAP * (1 - s.pos);
  const text = closed ? "closed · " + C.VOLTS + " V · " + C.AMPS.toFixed(2) + " A" : s.pos <= 0 && s.rate === 0 ? "open · 0 A" : "pressing · " + gap.toFixed(1) + " px to contact";
  if (text !== s.text) { s.text = text; say.textContent = text; }
}
let frame = 0, last = 0, visible = false, clock = 0, touring = !still.matches, resume = 0;
const tourAt = (t) => (t % 3.4 > 1.2 && t % 3.4 < 2 ? 1 : 0);
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (touring) { clock += dt; s.target = tourAt(clock); }
  step(dt, calm);
  const lit = s.pos >= 0.97 ? 1 : 0;
  s.glow = calm ? lit : s.glow + (lit - s.glow) * (1 - Math.exp(-dt / (lit > s.glow ? 0.06 : 0.2)));
  if (Math.abs(lit - s.glow) < 2e-3) s.glow = lit;
  draw();
  const settled = !touring && s.pos === s.target && s.rate === 0 && s.glow === lit;
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
function press() {
  touring = false;
  clearTimeout(resume);
  s.target = 1;
  run();
}
function release() {
  s.target = 0;
  clearTimeout(resume);
  if (!still.matches) resume = setTimeout(() => { touring = true; clock = 0; run(); }, 4000);
  run();
}
stage.addEventListener("pointerdown", (event) => {
  press();
  try { stage.setPointerCapture(event.pointerId); } catch {}
});
stage.addEventListener("pointerup", release);
stage.addEventListener("pointercancel", release);
stage.addEventListener("keydown", (event) => {
  if (event.key !== " " && event.key !== "Enter") return;
  event.preventDefault();
  if (!event.repeat) press();
});
stage.addEventListener("keyup", (event) => {
  if (event.key !== " " && event.key !== "Enter") return;
  event.preventDefault();
  release();
});
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: "Push button",
  hint: "Press and hold",
  readout: "open · 0 A",
  keys: [
    { mark: "lit", label: "The cap and copper bridge, which move when pressed" },
    { mark: "raised", label: "The two contact posts: the gap the bridge closes" },
  ],
  caption:
    "A push button wired in a loop with a 1.5 V cell and a small bulb. A spring holds the copper bridge 7 px above two contact posts, so no current flows. Press it and the bridge lands on both posts, the loop closes and about 0.3 A lights the bulb. Let go and the spring lifts the bridge off again.",
  body: `<style>${CSS}</style>${existsSync(join(OUT_DIR, PDF)) ? pdfButton(PDF) : ""}<div class="iso-stage pb-stage" tabindex="0" role="button" aria-pressed="false" aria-label="Push button. Press and hold the figure, or hold Space, to close the circuit and light the bulb.">${svg}</div>`,
});

const file = LIGHT ? "push-button-light.html" : "push-button.html";
writeFileSync(join(OUT_DIR, file), k.pageHtml({ title: "Push button", theme: LIGHT ? "light" : "dark", body, script: kitScript() + LIVE }));
console.log(`wrote ${file}`);
