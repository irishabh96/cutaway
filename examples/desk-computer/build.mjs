// An all-in-one desk computer in the spirit of 1984, with a keyboard you can type on.
// The CRT picture is drawn in the plane of the case front, inside two true recesses,
// and collapses to a line and a dot when the power goes off.
//   node build.mjs           -> desk-computer.html
//   node build.mjs --light   -> desk-computer-light.html
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";

const OUT_DIR = dirname(fileURLToPath(import.meta.url));
const LIGHT = process.argv.includes("--light");
const WIDTH = 600;
const HEIGHT = 440;

const PLATE = { x: -104, y: -68, w: 208, d: 172, r: 8 };
const CASE = { x: -40, y: -56, w: 80, d: 70, r: 5 };
const PLINTH = { x: -36, y: -52, w: 72, d: 62, r: 3 };
const LIFT = 5; // plinth height
const TOP = 105; // case top
const FRONT = CASE.y + CASE.d; // y of the case front
const SIDE = CASE.x + CASE.w; // x of the right side
const KB = { x: -60, y: 36, w: 120, d: 50, r: 3 };
const KB_Z = 2;
const KB_TOP = 7;
const UNIT = 112 / 15;
const ROW_PITCH = 8;
const ROW_RISE = [4.4, 4, 3.6, 3.2, 2.9]; // sculpted: back row tallest
const TRAVEL = 2.2;
const MAX_CHARS = 20;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -17, 0), ...k.boxCorners(CASE, 0, TOP), [70, 10, 6]],
  WIDTH,
  HEIGHT,
  { pad: 30, azimuth: 55 },
);
const cam = k.cameraOf(P);
const at = (point) => k.iso(point, P);
const path3 = (points, closed = false) => k.pathOf(points.map(at), closed);
const solid = (paths, style) => k.solidSvg(paths, style);
const line = (d, style) => k.lineSvg(d, style);
const dots = (points, style) => k.dotsSvg(points.map(at), style);
const halo = (plan, z, h) => `<path class="iso-halo" d="${k.haloOf(plan, z, h, P)}"/>`;
const nearFirst = (points) => [...points].sort((a, b) => k.depthOf([...a, 0], P) - k.depthOf([...b, 0], P));
const fmt = (n) => String(Math.round(n * 100) / 100);
const flat = (points, closed = true) => `M${points.map(([u, v]) => `${fmt(u)} ${fmt(v)}`).join("L")}${closed ? "Z" : ""}`;
const rounded = (u0, v0, u1, v1, r, steps = 4) => k.roundedPlan({ x: u0, y: v0, w: u1 - u0, d: v1 - v0, r }, steps);

// Faces of the case. On the front, local (u, v) is world (u, y, -v); on the right side
// a closed outline is given in (y, z).
const onFront = (y) => ([u, v]) => [u, y, -v];
const frontPath = (ring, y = FRONT) => path3(ring.map(onFront(y)), true);
const sidePath = (ring) => path3(ring.map(([y, z]) => [SIDE, y, z]), true);

// A recess in the front: walls between the face and the face moved back, shaded by facing.
function recess(ring, faceY, depth) {
  const n = ring.length;
  const cu = ring.reduce((s, p) => s + p[0], 0) / n;
  const cv = ring.reduce((s, p) => s + p[1], 0) / n;
  const walls = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let [nu, nv] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    if (nu * (cu - (a[0] + b[0]) / 2) + nv * (cv - (a[1] + b[1]) / 2) < 0) [nu, nv] = [-nu, -nv];
    const normal = [nu, 0, -nv];
    if (k.depthOf(normal, P) <= 1e-6) continue;
    const quad = path3([onFront(faceY)(a), onFront(faceY)(b), onFront(faceY - depth)(b), onFront(faceY - depth)(a)], true);
    if (normal[2] > 0.7) walls.push(`<path class="iso-top" d="${quad}"/>`);
    else {
      const shade = Math.min(3, Math.max(0, Math.floor(((normal[0] * -cam.sinA + normal[1] * cam.cosA + 1) / 2) * 4)));
      walls.push(`<path class="iso-shade" data-shade="${shade}" d="${quad}"/>`);
    }
  }
  return { walls: walls.join(""), face: frontPath(ring, faceY), back: frontPath(ring, faceY - depth) };
}

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
const LABEL = { x: -94, y: -34, w: 32, d: 16, r: 1.4 };
bench.push(solid(k.slabOf(LABEL, 0, 0.8, P, 4), { tone: "lo" }));
bench.push(line(k.planOutline(k.insetPlan(LABEL, 1.6), 0.8, P), { tone: "faint" }));
bench.push(line([[5, 22], [8.5, 16], [12, 19]].map(([dy, len]) => k.lineOnTop([LABEL.x + 4, LABEL.y + dy], [LABEL.x + 4 + len, LABEL.y + dy], 0.8, P)).join(""), { tone: "lo", free: true }));
bench.push(dots([[LABEL.x + LABEL.w - 4, LABEL.y + 8, 0.8]], { size: 0.6, tone: "mid" }));
const RULER = { x: PLATE.x + 14, y: PLATE.y + PLATE.d - 12, w: 70, d: 6, r: 1 };
const ticks = k.topTicks(RULER.x + 3, RULER.x + RULER.w - 3, 4, 5, RULER.y, 0.6, [1.8, 3.2], P);
bench.push(solid(k.slabOf(RULER, 0, 0.6, P, 3), { tone: "lo", crease: "none" }), line(ticks.minor, { tone: "lo" }), line(ticks.major, { tone: "mid" }));

// ---- case --------------------------------------------------------------------
const computer = [halo(CASE, 0, LIFT + 6)];
computer.push(solid(k.slabOf(PLINTH, 0, LIFT, P, 4, 0.4), { tone: "lo" }));
const seam = path3([[CASE.x, FRONT - 6, TOP], [SIDE, FRONT - 6, TOP], [SIDE, FRONT - 6, LIFT]]);
computer.push(solid(k.slabOf(CASE, LIFT, TOP - LIFT, P, 6, 1.2), { tone: "mid", inner: line(seam, { tone: "faint" }) }));
// top: carry-handle recess and a row of vents
const HANDLE = { x: -18, y: CASE.y + 5, w: 36, d: 8, r: 4 };
computer.push(line(k.planOutline(HANDLE, TOP, P) + k.planOutline(k.insetPlan(HANDLE, 1.4), TOP, P), { tone: "lo" }));
computer.push(line(Array.from({ length: 7 }, (_, i) => k.planOutline({ x: -22 + i * 6.8, y: CASE.y + 20, w: 2.6, d: 24, r: 1.3 }, TOP, P, 3)).join(""), { tone: "lo" }));
// right side: two groups of vents, the rocker and the keyboard port
const slots = (y0, y1, z0, count, gap) => Array.from({ length: count }, (_, i) => sidePath(rounded(y0, z0 + i * gap, y1, z0 + i * gap + 1.8, 0.9, 3))).join("");
computer.push(line(slots(CASE.y + 10, FRONT - 14, 76, 6, 4.2) + slots(CASE.y + 10, CASE.y + 40, 40, 4, 4.2), { tone: "lo" }));
const ROCKER = { y0: CASE.y + 12, y1: CASE.y + 22, z0: 16, z1: 28 };
computer.push(line(sidePath(rounded(ROCKER.y0 - 1.6, ROCKER.z0 - 1.6, ROCKER.y1 + 1.6, ROCKER.z1 + 1.6, 1.4, 3)), { tone: "faint" }));
computer.push(solid(k.slabOf({ x: SIDE, y: ROCKER.y0, w: 1.2, d: ROCKER.y1 - ROCKER.y0, r: 0.4 }, ROCKER.z0, ROCKER.z1 - ROCKER.z0, P, 2), { tone: "mid" }));
const midZ = (ROCKER.z0 + ROCKER.z1) / 2;
// The paddle in its two positions; CSS shows the one that matches the power.
const half = (z0, z1, out) => solid(k.slabOf({ x: SIDE + 1.2, y: ROCKER.y0 + 1, w: out, d: ROCKER.y1 - ROCKER.y0 - 2, r: 0.3 }, z0, z1 - z0, P, 1), { tone: "hi" });
const paddle = (upOut, downOut) => half(ROCKER.z0 + 1, midZ, downOut) + half(midZ, ROCKER.z1 - 1, upOut);
computer.push(`<g data-rocker="on">${paddle(0.6, 2.2)}</g><g data-rocker="off">${paddle(2.2, 0.6)}</g>`);
const PORT = { y0: FRONT - 18, y1: FRONT - 8, z0: 8, z1: 15 };
computer.push(line(sidePath(rounded(PORT.y0, PORT.z0, PORT.y1, PORT.z1, 1.2, 3)), { tone: "lo" }));
computer.push(solid(k.slabOf({ x: SIDE, y: PORT.y0 + 1.5, w: 5, d: PORT.y1 - PORT.y0 - 3, r: 0.8 }, PORT.z0 + 1, PORT.z1 - PORT.z0 - 2, P, 2, 0.3), { tone: "mid" }));
const PLUG_END = [SIDE + 8, (PORT.y0 + PORT.y1) / 2, (PORT.z0 + PORT.z1) / 2];
computer.push(solid(k.slabOf({ x: SIDE + 5, y: PLUG_END[1] - 1.4, w: 3, d: 2.8, r: 0.6 }, PLUG_END[2] - 1.4, 2.8, P, 2), { tone: "mid" }));

// front: panel inset, floppy slot, grille, LED
computer.push(line(frontPath(rounded(-35, -48, 35, -10, 3)), { tone: "faint" }));
const FLOPPY = rounded(-28, -37, 8, -32, 1.2, 3);
const floppy = recess(FLOPPY, FRONT, 2.4);
computer.push(`<path class="iso-shade" data-shade="0" d="${floppy.back}"/>`, floppy.walls);
computer.push(line(floppy.face, { tone: "lo" }), line(path3([[-26, FRONT - 2.4, 34.5], [6, FRONT - 2.4, 34.5]]), { tone: "faint", free: true }));
computer.push(solid(k.slabOf({ x: 11, y: FRONT, w: 3, d: 0.8, r: 0.4 }, 33, 3, P, 2), { tone: "mid" }));
computer.push(line(Array.from({ length: 9 }, (_, i) => frontPath(rounded(18 + i * 1.7, -42, 18.9 + i * 1.7, -27, 0.45, 2))).join(""), { tone: "lo" }));
computer.push(`<g class="dc-led">${dots([[-28, FRONT, 18]], { size: 0.9, tone: "hi" })}</g>`);

// screen: a bezel recess holding a deeper CRT recess
const BEZEL = rounded(-31, -99, 31, -51, 7, 6);
const BEZEL_DEPTH = 2.4;
const CRT = rounded(-26.5, -94, 26.5, -56, 9, 6);
const CRT_DEPTH = 5;
const GLASS_Y = FRONT - BEZEL_DEPTH - CRT_DEPTH;
const bezel = recess(BEZEL, FRONT, BEZEL_DEPTH);
const crt = recess(CRT, FRONT - BEZEL_DEPTH, CRT_DEPTH);
const CENTRE = [0, -75];
const mark = (() => {
  // The Anthropic "A": a slanted bar on the right and a leg with a triangular counter on the left.
  const s = 1.3;
  const place = (points) => points.map(([u, v]) => [CENTRE[0] - 7.2 + u * s, -91 + v * s]);
  const right = place([[5.6, 0], [7.5, 0], [11.1, 10], [9.2, 10]]);
  const left = place([[3.6, 0], [5.6, 0], [9.2, 10], [7.2, 10], [6.4, 7.6], [2.7, 7.6], [1.9, 10], [0, 10]]);
  const counter = place([[3.35, 5.8], [5.75, 5.8], [4.55, 2.5]]);
  return `<path class="dc-mark" d="${flat(right)}"/><path class="dc-mark" fill-rule="evenodd" d="${flat(left)}${flat(counter)}"/>`;
})();
const TEXT = { u: -23.5, v: -62.4, size: 3.4 };
const scanlines = Array.from({ length: 25 }, (_, i) => `<path class="dc-scan" d="M-27 ${fmt(-93.6 + i * 1.6)}H27"/>`).join("");
const picture = [
  `<ellipse class="dc-glow" cx="0" cy="${CENTRE[1]}" rx="30" ry="22"/>`,
  scanlines,
  mark,
  `<text class="dc-text" data-part="text" x="${TEXT.u}" y="${TEXT.v}" font-size="${TEXT.size}">&gt; </text>`,
  `<rect class="dc-cursor" data-part="cursor" x="${fmt(TEXT.u + 3.84)}" y="${fmt(TEXT.v - 2.5)}" width="1.8" height="3"/>`,
].join("");
const screen = [
  `<clipPath id="dc-bezel"><path d="${bezel.face}"/></clipPath>`,
  `<clipPath id="dc-crt"><path d="${crt.face}"/></clipPath>`,
  `<clipPath id="dc-glass"><path d="${flat(CRT)}"/></clipPath>`,
  `<g clip-path="url(#dc-bezel)">`,
  `<path class="iso-shade" data-shade="3" d="${bezel.back}"/>`,
  `<g clip-path="url(#dc-crt)">`,
  `<g transform="${k.sideMatrix([0, GLASS_Y], 0, P, "left")}" clip-path="url(#dc-glass)">`,
  `<path class="dc-glass" d="${flat(CRT)}"/>`,
  `<g class="dc-picture" data-part="crt">${picture}</g>`,
  `<path class="dc-beam" data-part="beam" d="M-24 ${CENTRE[1]}H24"/>`,
  `<circle class="dc-dot" data-part="dot" cx="${CENTRE[0]}" cy="${CENTRE[1]}" r="0.9"/>`,
  `<path class="dc-glare" d="M-21 -88.5Q-19.5 -91.6 -14 -92"/>`,
  `</g>`,
  crt.walls,
  `</g>`,
  bezel.walls,
  `</g>`,
  line(crt.back, { tone: "faint" }),
  line(crt.face, { tone: "lo" }),
  line(bezel.back, { tone: "faint" }),
  line(bezel.face, { tone: "lo" }),
].join("");
computer.push(screen);

// ---- keyboard ----------------------------------------------------------------
// [label, width in units, kind]; kind is the character typed, or a name for the other keys.
const ROWS = [
  [..."`1234567890-=".split("").map((c) => [c, 1, c]), ["Backspace", 2, "backspace"]],
  [["Tab", 1.5, "tab"], ..."qwertyuiop[]".split("").map((c) => [c, 1, c]), ["\\", 1.5, "\\"]],
  [["CapsLock", 1.75, "caps"], ..."asdfghjkl;'".split("").map((c) => [c, 1, c]), ["Enter", 2.25, "enter"]],
  [["Shift", 2.25, "shift-left"], ..."zxcvbnm,./".split("").map((c) => [c, 1, c]), ["Shift", 2.75, "shift-right"]],
  [["Alt", 1.5, "alt"], ["Meta", 1.5, "meta"], ["Space", 9, " "], ["Enter", 1.5, "enter"], ["Alt", 1.5, "alt"]],
];
const keyboard = [halo(KB, 0, KB_TOP)];
for (const [x, y] of nearFirst(k.corners(KB, 7))) keyboard.push(solid(k.cylinder(x, y, 2.4, 0, KB_Z, P, 16), { tone: "lo" }));
keyboard.push(solid(k.slabOf(KB, KB_Z, KB_TOP - KB_Z, P, 5, 0.8), { tone: "mid" }));
const WELL = { x: KB.x + 2.5, y: KB.y + 2.5, w: KB.w - 5, d: KB.d - 5, r: 2 };
keyboard.push(line(k.planOutline(WELL, KB_TOP, P), { tone: "faint" }));
keyboard.push(dots([[KB.x + 1.3, KB.y + KB.d / 2, KB_TOP], [KB.x + KB.w - 1.3, KB.y + KB.d / 2, KB_TOP]], { size: 0.45 }));
const CONNECTOR = { x: KB.x + KB.w, y: KB.y + 8, w: 3, d: 5, r: 0.8 };
keyboard.push(solid(k.slabOf(CONNECTOR, KB_Z + 1, 3.4, P, 2, 0.3), { tone: "mid" }));
const KEYS = [];
ROWS.forEach((row, r) => {
  let u = 0;
  const y = KB.y + 4.2 + r * ROW_PITCH;
  for (const [label, width, kind] of row) {
    const plan = { x: KB.x + 4 + u * UNIT + 0.45, y: y + 0.4, w: width * UNIT - 0.9, d: ROW_PITCH - 0.8, r: 0.9 };
    const svg = solid(k.slabOf(plan, KB_TOP, ROW_RISE[r], P, 2, 0.4), { tone: "mid", inner: "" }) + line(k.planOutline(k.insetPlan(plan, 1), KB_TOP + ROW_RISE[r], P, 2), { tone: "faint" });
    KEYS.push({ label, kind, svg });
    u += width;
  }
});
keyboard.push(...KEYS.map((key, index) => `<g class="dc-key" data-key="${index}">${key.svg}</g>`));

// ---- coiled cord from the side port to the keyboard -------------------------
const COIL = { x: 66, z: 2.8, r: 2.3, from: 6, to: 30, turns: 12 };
const smooth = (points, steps = 10) => {
  // a quadratic curve through the middle point, ends exact
  const [a, b, c] = points;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return [0, 1, 2].map((j) => (1 - t) ** 2 * a[j] + 2 * (1 - t) * t * b[j] + t * t * c[j]);
  });
};
const coilStart = [COIL.x + COIL.r, COIL.from, COIL.z];
const coilEnd = [COIL.x + COIL.r, COIL.to, COIL.z];
const plugIn = [CONNECTOR.x + CONNECTOR.w, CONNECTOR.y + CONNECTOR.d / 2, KB_Z + 2.7];
const lead = path3(smooth([PLUG_END, [PLUG_END[0] + 18, PLUG_END[1], 4], coilStart]));
const tail = path3(smooth([coilEnd, [COIL.x + COIL.r, CONNECTOR.y + CONNECTOR.d / 2, COIL.z + 0.4], plugIn]));
const coil = k.coil(COIL.from, COIL.to, [COIL.x, COIL.z], COIL.r, COIL.turns, "y", P, 14);
const cord = [line(coil.back, { tone: "lo" }), line(lead + tail, { tone: "mid" }), line(coil.front, { tone: "mid" })];

const GLOW = `<defs><radialGradient id="dc-glow-fill"><stop offset="0" style="stop-color:var(--cutaway-lit)" stop-opacity=".14"/><stop offset="1" style="stop-color:var(--cutaway-lit)" stop-opacity="0"/></radialGradient></defs>`;
const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "An all-in-one desk computer on a bench: a tall case with a CRT showing the Anthropic mark and a prompt line, a floppy slot and speaker grille below it, vents and a rocker switch on its side, and a keyboard joined to the side port by a coiled cord.",
  body: [GLOW, ...bench, `<g class="dc-computer" data-part="computer">${computer.join("")}</g>`, ...keyboard, ...cord],
});

const CSS = `
.dc-stage{border-radius:10px;outline:none;touch-action:pan-y;-webkit-tap-highlight-color:transparent}
.dc-stage:focus-visible{outline:1px solid var(--cutaway-muted);outline-offset:6px}
.dc-key,.dc-computer{cursor:pointer}
.dc-key[data-down]>.iso-solid>.iso-edge{stroke:var(--cutaway-hi)}
.dc-key[data-down]>.iso-line{stroke:var(--cutaway-mid)}
.dc-glass{fill:var(--cutaway-shade-0);transition:fill .4s var(--cutaway-ease)}
.dc-stage[data-on] .dc-glass{fill:var(--cutaway-lit-shade)}
.dc-glow{fill:url(#dc-glow-fill)}
.dc-scan{fill:none;stroke:var(--cutaway-faint);stroke-width:.35;vector-effect:non-scaling-stroke}
.dc-mark,.dc-text,.dc-cursor,.dc-dot{fill:var(--cutaway-lit);stroke:none}
.dc-text{font-family:var(--cutaway-mono);white-space:pre}
.dc-cursor{animation:dc-blink 1s steps(1,end) infinite}
.dc-beam{fill:none;stroke:var(--cutaway-lit);stroke-width:.8;opacity:0;vector-effect:non-scaling-stroke}
.dc-dot{opacity:0}
.dc-glare{fill:none;stroke:var(--cutaway-mid);stroke-width:.6;stroke-linecap:round;opacity:.6;vector-effect:non-scaling-stroke}
.dc-stage:not([data-on]) .dc-led circle{opacity:.12}
.dc-stage[data-on] [data-rocker="off"],.dc-stage:not([data-on]) [data-rocker="on"]{display:none}
.dc-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@keyframes dc-blink{50%{opacity:0}}
@media (prefers-reduced-motion:reduce){.dc-cursor{animation:none}.dc-glass{transition:none}}
`;

const LIVE = `
const P = ${JSON.stringify(P)};
const C = ${JSON.stringify({ TRAVEL, MAX_CHARS, CENTRE, TEXT, KEYS: KEYS.map(({ kind }) => kind) })};
const still = matchMedia("(prefers-reduced-motion: reduce)");
const stage = document.querySelector(".iso-stage");
const say = document.querySelector("[data-readout]");
const status = stage.querySelector("[data-status]");
const part = (name) => stage.querySelector('[data-part="' + name + '"]');
const textEl = part("text"), cursorEl = part("cursor"), pictureEl = part("crt"), beamEl = part("beam"), dotEl = part("dot");
const keyEls = [...stage.querySelectorAll("[data-key]")];
const [dx, dy] = axisVector(P, [0, 0, -1]);
const SHIFTED = { "~": "\`", "!": "1", "@": "2", "#": "3", "$": "4", "%": "5", "^": "6", "&": "7", "*": "8", "(": "9", ")": "0", "_": "-", "+": "=", "{": "[", "}": "]", "|": "\\\\", ":": ";", '"': "'", "<": ",", ">": ".", "?": "/" };
const indexOf = (kind) => C.KEYS.indexOf(kind);
const keys = C.KEYS.map(() => ({ d: 0, v: 0, hold: 0, shown: -1 }));
const s = { line: "", last: "", on: true, since: 9, drawnLine: null, text: "" };

function pressKey(index) {
  if (index < 0) return;
  keys[index].hold = 0.12;
  run();
}
function write() {
  textEl.textContent = "> " + s.line;
  cursorEl.setAttribute("x", (C.TEXT.u + textEl.getComputedTextLength() + 0.2).toFixed(2));
}
function readout() {
  const text = s.on ? "on · " + s.line.length + " chars" + (s.last ? " · key " + s.last : "") : "off";
  if (text !== s.text) { s.text = text; say.textContent = text; }
}
function typeChar(ch) {
  const base = SHIFTED[ch] ?? ch.toLowerCase();
  pressKey(indexOf(base));
  if (base !== ch) pressKey(indexOf("shift-left"));
  if (!s.on) return;
  if (s.line.length < C.MAX_CHARS) s.line += ch;
  s.last = ch === " " ? "space" : ch;
  write();
  readout();
}
function erase() {
  pressKey(indexOf("backspace"));
  if (!s.on) return;
  s.line = s.line.slice(0, -1);
  s.last = "backspace";
  write();
  readout();
}
function enter(index = indexOf("enter")) {
  pressKey(index);
  if (!s.on) return;
  s.line = "";
  s.last = "return";
  write();
  readout();
}
function setPower(on) {
  if (on === s.on) return;
  s.on = on;
  s.since = 0;
  stage.toggleAttribute("data-on", on);
  status.textContent = on ? "The computer is on." : "The computer is off.";
  readout();
  run();
}
// The picture in face coordinates: squash to a line, shrink the line to a dot, fade the dot.
function crtAt(t, on) {
  let sx = 1, sy = 1, beam = 0, dot = 0;
  if (on) {
    if (t < 0.15) { sx = Math.max(0.001, t / 0.15); sy = 0.02; beam = 1; }
    else if (t < 0.25) { sy = 0.02 + 0.98 * ((t - 0.15) / 0.1); beam = 1 - (t - 0.15) / 0.1; }
  } else {
    if (t < 0.1) { sy = 1 - 0.98 * (t / 0.1); beam = t / 0.1; }
    else if (t < 0.25) { sy = 0.02; sx = Math.max(0.001, 1 - (t - 0.1) / 0.15); beam = 1; }
    else { sx = 0.001; sy = 0.02; dot = Math.max(0, 1 - (t - 0.25) / 0.5); }
  }
  return { sx, sy, beam, dot };
}
function drawCrt() {
  const t = still.matches ? 9 : s.since;
  const { sx, sy, beam, dot } = crtAt(t, s.on);
  const [cx, cy] = C.CENTRE;
  pictureEl.setAttribute("transform", "translate(" + cx + " " + cy + ") scale(" + sx.toFixed(3) + " " + sy.toFixed(3) + ") translate(" + -cx + " " + -cy + ")");
  beamEl.setAttribute("transform", "translate(" + cx + " " + cy + ") scale(" + sx.toFixed(3) + " 1) translate(" + -cx + " " + -cy + ")");
  beamEl.style.opacity = beam.toFixed(3);
  dotEl.style.opacity = dot.toFixed(3);
}
function stepKeys(dt, calm) {
  let moving = false;
  keys.forEach((key, index) => {
    if (key.hold > 0) key.hold -= dt;
    const goal = key.hold > 0 ? 1 : 0;
    if (calm) { key.d = goal; key.v = 0; }
    else {
      const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
      for (let i = 0; i < n; i++) { key.v += (1600 * (goal - key.d) - 60 * key.v) * h; key.d += key.v * h; }
      if (Math.abs(goal - key.d) < 1e-3 && Math.abs(key.v) < 1e-2) { key.d = goal; key.v = 0; }
    }
    if (key.d !== key.shown) {
      key.shown = key.d;
      const el = keyEls[index];
      if (key.d) el.setAttribute("transform", "translate(" + (dx * C.TRAVEL * key.d).toFixed(2) + " " + (dy * C.TRAVEL * key.d).toFixed(2) + ")");
      else el.removeAttribute("transform");
      el.toggleAttribute("data-down", key.d > 0.35);
    }
    if (key.hold > 0 || key.d !== 0) moving = true;
  });
  return moving;
}

// Idle tour: type a few phrases like a person, erase them, then switch off and on.
const PHRASES = ["hello, world", "see inside", "ls -la", "run cutaway"];
let queue = [], wait = 1.4, touring = !still.matches, resume = 0;
function plan() {
  const out = [];
  for (const phrase of PHRASES) {
    for (const ch of phrase) out.push([0.09 + Math.random() * 0.14 + (ch === " " ? 0.08 : 0), () => typeChar(ch)]);
    out.push([1.4, null]);
    for (let i = 0; i < phrase.length; i++) out.push([0.05, erase]);
    out.push([0.7, null]);
  }
  out.push([0.4, () => setPower(false)], [2.4, () => setPower(true)], [1.6, null]);
  return out;
}
function tour(dt) {
  wait -= dt;
  while (wait <= 0) {
    if (!queue.length) queue = plan();
    const [gap, act] = queue.shift();
    if (act) act();
    wait += gap;
  }
}
function takeOver(toggling) {
  clearTimeout(resume);
  if (touring) {
    touring = false;
    queue = [];
    s.line = "";
    s.last = "";
    write();
    if (!toggling) setPower(true);
    readout();
  }
  if (!still.matches) resume = setTimeout(() => {
    s.line = "";
    s.last = "";
    write();
    setPower(true);
    readout();
    queue = [];
    wait = 1;
    touring = true;
    run();
  }, 9000);
}

let frame = 0, last = 0, visible = false;
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (touring) tour(dt);
  s.since += dt;
  const moving = stepKeys(dt, calm);
  drawCrt();
  const settled = !touring && !moving && (calm || s.since > 0.8);
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };

stage.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.key === "Tab") return;
  const key = event.key;
  if (key === "Escape") { event.preventDefault(); takeOver(true); setPower(!s.on); return; }
  if (key === "Backspace") { event.preventDefault(); takeOver(false); erase(); }
  else if (key === "Enter") { event.preventDefault(); takeOver(false); enter(); }
  else if (key === "Shift") { takeOver(false); pressKey(indexOf(event.code === "ShiftRight" ? "shift-right" : "shift-left")); }
  else if (key.length === 1) { event.preventDefault(); takeOver(false); typeChar(key); }
});
stage.addEventListener("click", (event) => {
  const keyEl = event.target.closest("[data-key]");
  if (keyEl) {
    const index = Number(keyEl.dataset.key), kind = C.KEYS[index];
    takeOver(false);
    if (kind === "backspace") erase();
    else if (kind === "enter") enter(index);
    else if (kind.length === 1) typeChar(kind);
    else pressKey(index);
  } else if (event.target.closest('[data-part="computer"]')) {
    takeOver(true);
    setPower(!s.on);
  } else return;
  stage.focus({ preventScroll: true });
});
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
write();
`;

const body = k.plateHtml({
  fig: "Fig 2",
  title: "Desk computer",
  hint: "Type on it · click to switch",
  readout: "on · 0 chars",
  keys: [
    { mark: "lit", label: "The screen: the Anthropic mark and what you type" },
    { mark: "raised", label: "Fifty-eight keys, each going down as it is typed" },
    { mark: "edge", label: "The coiled cord from the keyboard to the side port" },
  ],
  caption:
    "An all-in-one desk computer in the spirit of 1984: a CRT in a tall case, with a floppy slot and a speaker grille under it and vents and a rocker switch on its side. Focus it and type: the keys go down and the characters land on the screen beneath the Anthropic mark. Backspace and Return work. Escape or a click on the case switches it off, and the picture collapses to a line and a dot, as a CRT does.",
  body: `<style>${CSS}</style><div class="iso-stage dc-stage" tabindex="0" role="group" data-on="" aria-label="Desk computer. Type to write on its screen; Backspace erases and Return clears the line. Escape, or a click on the case, switches the power.">${svg}<span class="dc-sr" role="status" aria-live="polite" data-status></span></div>`,
});

const file = LIGHT ? "desk-computer-light.html" : "desk-computer.html";
writeFileSync(join(OUT_DIR, file), k.pageHtml({ title: "Desk computer", theme: LIGHT ? "light" : "dark", body, script: kitScript() + LIVE }));
console.log(`wrote ${file}`);
