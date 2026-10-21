// Builds the ripple tank page: a school ripple tank on tall legs over a paper screen,
// lit by a strobe lamp, with WebGL light on the paper and on the water.
//   node examples/ripple-tank/build.mjs          -> ripple-tank.html
//   node examples/ripple-tank/build.mjs --light  -> ripple-tank-light.html
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { glCamera } from "../../kit/gl.mjs";
import { tubePieces, tubeSvg } from "../../kit/tube.mjs";
import { kitScript, glScript } from "../../scripts/inline-kit.mjs";
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME = process.argv.includes("--light") ? "light" : "dark";
const OUT = THEME === "light" ? "ripple-tank-light.html" : "ripple-tank.html";

const W = 720;
const H = 730;
const AZIMUTH = 35;
const ELEVATION = 44;

// ---- Key heights (mm above the base plate's top) ----
const Z = { paper: 0.3, bed: 202, floor: 206, water: 212, rim: 218, cap: 223 };
const LAMP = [0, 0, 612];
const LAMP_RADIUS = 1.5;

// ---- Plans (mm). x runs toward the viewer's right, y toward the viewer's left. ----
const rect = (x0, y0, x1, y1, r = 0) => ({ x: x0, y: y0, w: x1 - x0, d: y1 - y0, r });
const grow = (plan, by) => k.insetPlan(plan, -by);

const INSIDE = rect(-110, -90, 110, 90, 2);
const GLASS = 4;
const WALL_OUT = grow(INSIDE, GLASS);
const OUTSIDE = rect(-124, -104, 124, 104, 3);
const RAIL_Z = [190, Z.floor];
const POST_SIZE = 12;
const LEG = { x: 118, y: 98, r: 4.5, top: RAIL_Z[0], bottom: 26 };
const BEACH = 9;

const optics = { magnification: M.magnificationOf({ lamp: LAMP[2], water: Z.water, paper: Z.paper }) };
optics.caustic = M.causticDistanceOf({ lamp: LAMP[2], water: Z.water, floor: Z.floor, bed: Z.bed, paper: Z.paper });

const castPlan = (plan) => {
  const m = optics.magnification;
  return { x: plan.x * m, y: plan.y * m, w: plan.w * m, d: plan.d * m, r: plan.r * m };
};
const SHADOW = castPlan(OUTSIDE);
const PAPER = rect(Math.floor(SHADOW.x - 10), Math.floor(SHADOW.y - 10), Math.ceil(SHADOW.x + SHADOW.w + 10), Math.ceil(SHADOW.y + SHADOW.d + 10), 1);
const BASE = rect(-218, -248, 218, 276, 10);
const BASE_Z = [-14, 0];
const FOOT_Z = [-21, -14];

const BOX = rect(-196, 190, -112, 256, 4);
const BOX_TOP = 46;
const KNOB = { x: -175, y: 222, r: 9.5, top: BOX_TOP + 11 };
const METER = { x: -136, y: 214, r: 15 };
const SWITCH = { x: -178, y: 245 };
const LED = { x: -150, y: 246 };

const POST = { x: 132, y: -224, r: 8.5, top: 662 };
const ARM_Z = 646;

const DIP_X = -46;
const BAR = { y: 72, half: 4, z: [254, 262] };
const SPRING_Y = 60;
const BEAM = { half: 5, y: 100, z: [302, 312] };
const PILLAR = { half: 6, y: 92, w: 4 };
const MOTOR = { x0: DIP_X - 13, x1: DIP_X + 11, z: 279, r: 9 };
const SHAFT = { x0: MOTOR.x1, x1: MOTOR.x1 + 6, r: 1.6 };
const ECCENTRIC = { x: SHAFT.x1 - 1.5, offset: 2.4, r: 3 };
const BALL = { r: 3 };
const BALL_Z = Z.water + BALL.r - 0.05;

const STATE0 = M.stateOf(M.START.f, M.START.d, optics);
const START_PHASE = 0.9;

// ---- Camera ----
const P = k.fitProjection(
  [
    ...k.boxCorners(BASE, FOOT_Z[0], 0),
    [POST.x, POST.y, POST.top + 4],
    [0, 0, ARM_Z + 6],
    [POST.x, POST.y, ARM_Z + 6],
    [DIP_X, -BEAM.y, BEAM.z[1]],
    [DIP_X, BEAM.y, BEAM.z[1]],
  ],
  W,
  H,
  { pad: 60, azimuth: AZIMUTH, elevation: ELEVATION },
);
const at = (p) => k.iso(p, P);
const path3 = (points, closed = false) => k.pathOf(points.map(at), closed);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const slab = (plan, z0, z1, style = {}, bevel = 0) => S(k.slabOf(plan, z0, z1 - z0, P, 8, bevel), style);
const rod = (x, y, r, z0, z1, style = {}, steps = 28) => S(k.cylinder(x, y, r, z0, z1 - z0, P, steps), style);
const [VX, VY] = k.towardViewer(P);
const facing = (nx, ny) => nx * VX + ny * VY > 0;

function hull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const out = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

// A cylinder lying along x: hull of both end rings, the near (+x) end drawn as a face.
function xCylinderSvg(x0, x1, y, z, r, { tone = "hi", lit = false, className } = {}) {
  const ringAt = (x) => Array.from({ length: 36 }, (_, i) => at([x, y + r * Math.cos((i / 36) * Math.PI * 2), z + r * Math.sin((i / 36) * Math.PI * 2)]));
  const outline = k.pathOf(hull([...ringAt(x0), ...ringAt(x1)]), true);
  const face = k.pathOf(ringAt(x1), true);
  const band = path3([[x0, y - r * 0.2, z + r * 0.98], [x1, y - r * 0.2, z + r * 0.98]]);
  const cls = className ? `iso-solid ${className}` : "iso-solid";
  return `<g class="${cls}"${lit ? ' data-lit=""' : ""}><path class="iso-fill" d="${outline}"/><path class="iso-shade" data-shade="1" d="${outline}"/><path class="iso-top" d="${face}"/>${L(band, { tone: "faint" })}<path class="iso-line iso-edge" data-tone="${tone}" d="${outline}${face}"/></g>`;
}

// A vertical frustum (the lamp shade), radius r0 at z0 and r1 at z1.
function frustumSvg(x, y, z0, r0, z1, r1) {
  const ringAt = (z, r) => Array.from({ length: 40 }, (_, i) => at([x + r * Math.cos((i / 40) * Math.PI * 2), y + r * Math.sin((i / 40) * Math.PI * 2), z]));
  const outline = k.pathOf(hull([...ringAt(z0, r0), ...ringAt(z1, r1)]), true);
  const top = k.pathOf(ringAt(z1, r1), true);
  const lip = k.sideArc(x, y, r0 - 1.2, z0 + 1.2, P, 28);
  return `<g class="iso-solid rt-shade"><path class="iso-fill" d="${outline}"/><path class="iso-shade" data-shade="0" d="${outline}"/><path class="iso-top" d="${top}"/>${L(lip, { tone: "faint" })}<path class="iso-line iso-edge" data-tone="hi" d="${outline}${top}"/></g>`;
}

// A vertical coil spring, split into the half that faces away and the half that faces the viewer.
function springPaths(x, y, r, z0, z1, turns) {
  const count = Math.round(turns * 24);
  const back = [];
  const front = [];
  let run = [];
  let near = null;
  for (let i = 0; i <= count; i++) {
    const a = (i / count) * turns * Math.PI * 2;
    const point = at([x + r * Math.cos(a), y + r * Math.sin(a), z0 + ((z1 - z0) * i) / count]);
    const side = facing(Math.cos(a), Math.sin(a));
    if (near === null) near = side;
    run.push(point);
    if (side !== near) {
      (near ? front : back).push(k.pathOf(run));
      run = [point];
      near = side;
    }
  }
  if (run.length > 1) (near ? front : back).push(k.pathOf(run));
  return { back: back.join(""), front: front.join("") };
}

const tube = (points, radius, tone = "hi", options = {}) => tubePieces(points, radius, P, options).map((piece) => tubeSvg(piece, { tone })).join("");

// Quadratic bezier sampled in 3D, for cable runs.
function curve(a, c, b, steps = 16) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    return [0, 1, 2].map((axis) => u * u * a[axis] + 2 * u * t * c[axis] + t * t * b[axis]);
  });
}

// =====================================================================
// Back SVG: base plate, paper, tape, the lamp cable over the edge, fallback.
// =====================================================================
const back = [];
back.push(`<path class="iso-halo" d="${k.haloOf(BASE, FOOT_Z[0], BASE_Z[1] - FOOT_Z[0], P)}"/>`);
const FEET = [
  [-196, -226], [196, -226], [-196, 254], [196, 254], [196, 14], [0, 254],
];
for (const [fx, fy] of FEET) back.push(rod(fx, fy, 9, FOOT_Z[0], FOOT_Z[1] + 0.5, { tone: "mid", crease: "none" }));
back.push(slab(BASE, BASE_Z[0], BASE_Z[1], { tone: "hi", crease: "faint" }, 3));

// Edge ticks down the two faces that face the viewer.
{
  const ticksX = k.sideTicks(BASE.y + 20, BASE.y + BASE.d - 20, 10, 5, BASE.x + BASE.w, -0.8, [2.2, 4.4], P, "y");
  const ticksY = k.sideTicks(BASE.x + 20, BASE.x + BASE.w - 20, 10, 5, BASE.y + BASE.d, -0.8, [2.2, 4.4], P, "x");
  back.push(L(ticksX.minor + ticksY.minor, { tone: "faint" }), L(ticksX.major + ticksY.major, { tone: "lo" }));
}

// Corner screws.
for (const [sx, sy] of k.corners(BASE, 11)) {
  back.push(L(k.ring(sx, sy, 3.6, 0.01, P, 24), { tone: "mid" }));
  back.push(L(k.lineOnTop([sx - 2.4, sy - 1.2], [sx + 2.4, sy + 1.2], 0.01, P), { tone: "lo" }));
}

// Ruler strip along the near x edge.
{
  const strip = rect(201, -150, 212, 150, 0.6);
  back.push(slab(strip, 0, 0.8, { tone: "mid", crease: "none" }));
  const ticks = k.topTicks(strip.y + 2, strip.y + strip.d - 2, 5, 2, strip.x + strip.w, 0.8, [-2.6, -5.2], P, "y");
  back.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
}

// Label plate, engraved.
{
  const plate = rect(46, 212, 156, 240, 2);
  back.push(slab(plate, 0, 1.6, { tone: "mid", crease: "faint" }, 0.8));
  back.push(L(k.planOutline(k.insetPlan(plate, 3), 1.61, P), { tone: "faint" }));
  back.push(k.faceTextSvg(k.topMatrix([plate.x + 11, plate.y + 18.5], 1.62, P, "x"), "RIPPLE TANK", { size: 8.5, tone: "lo" }));
}

// The paper sheet and its four pieces of tape.
back.push(S(k.slabOf(PAPER, 0, Z.paper, P, 4), { tone: "mid", crease: "none", flat: true, className: "rt-sheet" }));
for (const [cx, cy] of k.corners(PAPER, 0)) {
  const sx = Math.sign(cx);
  const sy = Math.sign(cy);
  const along = [sx * Math.SQRT1_2, -sy * Math.SQRT1_2];
  const across = [sy * Math.SQRT1_2, sx * Math.SQRT1_2];
  const mid = [cx - sx * 2, cy - sy * 2];
  const corner = (u, v) => [mid[0] + along[0] * u + across[0] * v, mid[1] + along[1] * u + across[1] * v];
  const piece = [corner(-15, -5), corner(15, -5), corner(15, 5), corner(-15, 5)];
  const z = Z.paper + 0.1;
  back.push(`<g class="iso-solid rt-tape"><path class="iso-fill" d="${k.onTop(piece, z, P, true)}"/><path class="iso-line iso-edge" data-tone="lo" d="${k.onTop(piece, z, P, true)}"/></g>`);
}

// The lamp cable: from the post foot across the base and down over the near x edge.
const CABLE_R = 1.5;
const LAMP_CABLE_FOOT = [POST.x + POST.r + 2, POST.y + 4, 1.5];
back.push(
  tube(
    [
      LAMP_CABLE_FOOT,
      [170, POST.y + 6, CABLE_R],
      [BASE.x + BASE.w - 6, POST.y + 10, CABLE_R],
      [BASE.x + BASE.w + 2, POST.y + 11, -2],
      [BASE.x + BASE.w + 3, POST.y + 12, -12],
      [BASE.x + BASE.w + 4, POST.y + 13, -24],
    ],
    CABLE_R,
    "mid",
    { caps: [true, false] },
  ),
);

// The SVG fallback pattern on the paper (hidden once WebGL runs).
const CAST = (point) => {
  const t = (LAMP[2] - Z.paper) / (LAMP[2] - Z.water);
  return [LAMP[0] + (point[0] - LAMP[0]) * t, LAMP[1] + (point[1] - LAMP[1]) * t, Z.paper];
};
const PATTERN_GEOMETRY = { x: DIP_X, inside: [INSIDE.x, INSIDE.y, INSIDE.x + INSIDE.w, INSIDE.y + INSIDE.d], lamp: LAMP, water: Z.water, paper: Z.paper };
const pattern0 = M.patternOf(STATE0, PATTERN_GEOMETRY, at, START_PHASE);
{
  const shadowOutline = k.pathOf(k.ringOf(INSIDE).map((p) => at(CAST(p))), true);
  back.push(
    `<g class="rt-fallback">${L(shadowOutline, { tone: "lo" })}<path class="iso-line" data-tone="faint" data-part="crests" d="${pattern0.crests}"/><path class="iso-line" data-tone="lo" data-part="nodal" d="${pattern0.nodal}"/></g>`,
  );
}

// =====================================================================
// Middle SVG: post, arm, lamp, control box, legs, far frame, beach, water.
// =====================================================================
const mid = [];

// Lamp post with its foot boss and arm clamp.
mid.push(`<path class="iso-halo" d="${k.haloOf({ x: POST.x - 18, y: POST.y - 18, w: 36, d: 36, r: 18 }, 0, 6, P)}"/>`);
mid.push(rod(POST.x, POST.y, 18, 0, 8, { tone: "hi" }, 36));
mid.push(L(k.knurl(POST.x, POST.y, 18, 0, 8, 40, P), { tone: "faint" }));
mid.push(rod(POST.x, POST.y, POST.r, 8, POST.top, { tone: "hi" }, 28));
mid.push(rod(POST.x, POST.y, POST.r + 0.8, POST.top - 1.5, POST.top, { tone: "hi" }));

// Lamp cable down the post (behind the clamp) and onto the base.
const ARM_DIR = (() => {
  const dx = -POST.x;
  const dy = -POST.y;
  const len = Math.hypot(dx, dy);
  return [dx / len, dy / len];
})();
const ARM_SIDE = [-ARM_DIR[1], ARM_DIR[0]];
const postSide = [POST.x + (POST.r + CABLE_R) * VX, POST.y + (POST.r + CABLE_R) * VY];
mid.push(
  tube(
    [
      [postSide[0], postSide[1], ARM_Z - 14],
      [postSide[0], postSide[1], 40],
      [postSide[0] + 2, postSide[1] + 1.5, 14],
      [LAMP_CABLE_FOOT[0], LAMP_CABLE_FOOT[1], 4],
      LAMP_CABLE_FOOT,
    ],
    CABLE_R,
    "mid",
    { caps: [false, false] },
  ),
);
mid.push(rod(POST.x, POST.y, 13, ARM_Z - 10, ARM_Z + 8, { tone: "hi" }, 32));
mid.push(L(k.lineOnTop([POST.x - 13 * ARM_SIDE[0], POST.y - 13 * ARM_SIDE[1]], [POST.x + 13 * ARM_SIDE[0], POST.y + 13 * ARM_SIDE[1]], ARM_Z + 8.01, P), { tone: "faint" }));

// Arm, drop rod and shade.
const ARM_END = [ARM_DIR[0] * 4, ARM_DIR[1] * 4];
mid.push(tube([[POST.x + ARM_DIR[0] * 12, POST.y + ARM_DIR[1] * 12, ARM_Z], [ARM_END[0], ARM_END[1], ARM_Z]], 3.6, "hi", { caps: [false, true] }));
const armCableOff = [ARM_SIDE[0] * 6, ARM_SIDE[1] * 6];
mid.push(
  tube(
    [
      [LAMP[0] + armCableOff[0] * 0.7, LAMP[1] + armCableOff[1] * 0.7, LAMP[2] + 22],
      [armCableOff[0] * 1.1, armCableOff[1] * 1.1, ARM_Z - 2],
      [POST.x * 0.5 + armCableOff[0], POST.y * 0.5 + armCableOff[1], ARM_Z - 4],
      [postSide[0] + ARM_DIR[0] * 6, postSide[1] + ARM_DIR[1] * 6, ARM_Z - 6],
      [postSide[0], postSide[1], ARM_Z - 14],
    ],
    1.2,
    "mid",
    { caps: [true, false] },
  ),
);
mid.push(rod(0, 0, 2.2, LAMP[2] + 22, ARM_Z, { tone: "hi" }, 16));
mid.push(rod(0, 0, 5.5, LAMP[2] + 18, LAMP[2] + 24, { tone: "hi" }, 24));
mid.push(frustumSvg(0, 0, LAMP[2] - 1, 21, LAMP[2] + 19, 6.5));

// Control box: frequency knob, meter, switch, LED, vents and the plug.
mid.push(`<path class="iso-halo" d="${k.haloOf(BOX, 0, 6, P)}"/>`);
mid.push(slab(BOX, 0, BOX_TOP, { tone: "hi", crease: "faint" }, 2));
mid.push(L(k.planOutline(k.insetPlan(BOX, 6), BOX_TOP + 0.01, P), { tone: "faint" }));
{
  // Vent slots on the face toward the viewer's left (+y).
  const face = BOX.y + BOX.d;
  const slots = [];
  for (let i = 0; i < 7; i++) {
    const x = BOX.x + 16 + i * 7;
    slots.push(k.segment([x, face + 0.01, 12], [x, face + 0.01, 30], P));
  }
  mid.push(L(slots.join(""), { tone: "lo" }));
  // Knob dial ticks (270 degrees) and the knurled knob.
  const sweep = (Math.PI * 3) / 2;
  const dial = k.radialTicks(KNOB.x, KNOB.y, KNOB.r + 6.5, 20, 5, BOX_TOP + 0.01, [1.6, 3], P, (-3 * Math.PI) / 4, sweep);
  mid.push(L(dial.minor, { tone: "lo" }), L(dial.major, { tone: "mid" }));
  mid.push(`<path class="iso-halo" d="${k.haloOf({ x: KNOB.x - KNOB.r, y: KNOB.y - KNOB.r, w: KNOB.r * 2, d: KNOB.r * 2, r: KNOB.r }, BOX_TOP, 2, P)}"/>`);
  mid.push(rod(KNOB.x, KNOB.y, KNOB.r, BOX_TOP, KNOB.top, { tone: "hi" }, 32));
  mid.push(L(k.knurl(KNOB.x, KNOB.y, KNOB.r, BOX_TOP, KNOB.top, 36, P), { tone: "faint" }));
  mid.push(`<path class="iso-line" data-tone="hi" data-part="pointer" d=""/>`);
  // Round meter set into the lid, with its scale and needle.
  mid.push(S(k.cylinder(METER.x, METER.y, METER.r + 2, BOX_TOP, 1.2, P, 40), { tone: "mid", crease: "faint" }));
  mid.push(L(k.ring(METER.x, METER.y, METER.r - 0.5, BOX_TOP + 1.21, P, 48), { tone: "lo" }));
  const scale = k.radialTicks(METER.x, METER.y, METER.r - 2.5, 20, 5, BOX_TOP + 1.22, [1.4, 2.8], P, (-3 * Math.PI) / 4, sweep);
  mid.push(L(scale.minor, { tone: "lo" }), L(scale.major, { tone: "mid" }));
  mid.push(`<path class="iso-line" data-tone="lit" data-part="needle" d=""/>`);
  mid.push(L(k.ring(METER.x, METER.y, 1.3, BOX_TOP + 1.23, P, 12), { tone: "hi" }));
  // Toggle switch and LED.
  mid.push(rod(SWITCH.x, SWITCH.y, 3.6, BOX_TOP, BOX_TOP + 2.4, { tone: "hi" }, 20));
  mid.push(L(k.segment([SWITCH.x, SWITCH.y, BOX_TOP + 2.4], [SWITCH.x - 3.2, SWITCH.y + 1.8, BOX_TOP + 9.5], P), { tone: "hi", className: "rt-lever" }));
  mid.push(rod(LED.x, LED.y, 2.2, BOX_TOP, BOX_TOP + 1.6, { tone: "lit", lit: true }, 16));
  mid.push(k.faceTextSvg(k.topMatrix([KNOB.x - 9, KNOB.y + 18], BOX_TOP + 0.02, P, "x"), "Hz", { size: 4.5, tone: "lo" }));
}
// Plug on the +x face of the box, where the motor cable leaves.
const PLUG = [BOX.x + BOX.w, 200, 18];
mid.push(xCylinderSvg(PLUG[0], PLUG[0] + 5, PLUG[1], PLUG[2], 3.4, { tone: "hi" }));

// Motor cable, first run: plug, across the base, up the left leg in clips, up the corner post.
const LEFT_LEG = [-LEG.x, LEG.y];
const legSide = [LEFT_LEG[0] + (LEG.r + 1.4) * 0.62, LEFT_LEG[1] + (LEG.r + 1.4) * 0.78];
const POST_FACE_Y = OUTSIDE.y + OUTSIDE.d + 1.4;
const CORNER_X = OUTSIDE.x + POST_SIZE / 2;
const motorLegRun = [
  [PLUG[0] + 5, PLUG[1], PLUG[2]],
  [PLUG[0] + 12, PLUG[1] - 2, 9],
  [PLUG[0] + 13, PLUG[1] - 18, 1.4],
  [legSide[0] + 6, legSide[1] + 18, 1.4],
  [legSide[0], legSide[1] + 4, 6],
  [legSide[0], legSide[1], 30],
  [legSide[0], legSide[1], LEG.top - 8],
  [CORNER_X + 2, POST_FACE_Y, LEG.top + 2],
  [CORNER_X + 2, POST_FACE_Y, Z.cap - 2],
  [CORNER_X + 3, POST_FACE_Y - 4, Z.cap + 1.4],
];
mid.push(tube(motorLegRun, 1.4, "mid", { caps: [false, false] }));

// Legs with levelling screws and threaded feet.
const legSvg = (sx, sy) => {
  const x = sx * LEG.x;
  const y = sy * LEG.y;
  const parts = [];
  parts.push(`<path class="iso-halo" d="${k.haloOf({ x: x - 7, y: y - 7, w: 14, d: 14, r: 7 }, 0, 2, P)}"/>`);
  parts.push(rod(x, y, 6, Z.paper, 3.2, { tone: "hi" }, 24));
  parts.push(rod(x, y, 2.6, 3.2, LEG.bottom, { tone: "hi" }, 16));
  const threads = [];
  for (let z = 5; z < 15; z += 1.6) threads.push(k.sideArc(x, y, 2.6, z, P, 10));
  parts.push(L(threads.join(""), { tone: "lo" }));
  parts.push(rod(x, y, 7.5, 15, 23, { tone: "hi" }, 28));
  parts.push(L(k.knurl(x, y, 7.5, 15, 23, 30, P), { tone: "faint" }));
  parts.push(rod(x, y, 3.4, 23, LEG.bottom + 0.5, { tone: "hi" }, 16));
  parts.push(rod(x, y, LEG.r, LEG.bottom, LEG.top - 6, { tone: "hi" }, 24));
  parts.push(rod(x, y, LEG.r + 1.6, LEG.top - 6, LEG.top, { tone: "hi" }, 24));
  return parts.join("");
};
const LEG_ORDER = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
for (const [sx, sy] of LEG_ORDER) {
  mid.push(legSvg(sx, sy));
  if (sx === -1 && sy === 1) {
    // Clips holding the motor cable to the left leg.
    for (const z of [48, 104, 160]) {
      mid.push(L(k.sideArc(legSide[0], legSide[1], 2.3, z, P, 12) + k.sideArc(LEFT_LEG[0], LEFT_LEG[1], LEG.r + 0.5, z, P, 16), { tone: "hi" }));
    }
  }
}

// Far rails, three corner posts, far glass, the foam beach and the plain-water fill.
const RAILS = {
  farX: rect(OUTSIDE.x, OUTSIDE.y + POST_SIZE, OUTSIDE.x + 10, OUTSIDE.y + OUTSIDE.d - POST_SIZE),
  farY: rect(OUTSIDE.x + POST_SIZE, OUTSIDE.y, OUTSIDE.x + OUTSIDE.w - POST_SIZE, OUTSIDE.y + 10),
  nearX: rect(OUTSIDE.x + OUTSIDE.w - 10, OUTSIDE.y + POST_SIZE, OUTSIDE.x + OUTSIDE.w, OUTSIDE.y + OUTSIDE.d - POST_SIZE),
  nearY: rect(OUTSIDE.x + POST_SIZE, OUTSIDE.y + OUTSIDE.d - 10, OUTSIDE.x + OUTSIDE.w - POST_SIZE, OUTSIDE.y + OUTSIDE.d),
};
const cornerPost = (sx, sy) => {
  const x0 = sx < 0 ? OUTSIDE.x : OUTSIDE.x + OUTSIDE.w - POST_SIZE;
  const y0 = sy < 0 ? OUTSIDE.y : OUTSIDE.y + OUTSIDE.d - POST_SIZE;
  return slab(rect(x0, y0, x0 + POST_SIZE, y0 + POST_SIZE, 1), RAIL_Z[0], Z.cap, { tone: "hi", crease: "faint" }, 0.6);
};
mid.push(slab(RAILS.farX, RAIL_Z[0], RAIL_Z[1], { tone: "hi", crease: "faint" }, 0.6));
mid.push(slab(RAILS.farY, RAIL_Z[0], RAIL_Z[1], { tone: "hi", crease: "faint" }, 0.6));
mid.push(cornerPost(-1, -1), cornerPost(1, -1), cornerPost(-1, 1));
const glassWall = (plan) => S(k.slabOf(plan, Z.floor, Z.rim - Z.floor, P, 2), { tone: "mid", crease: "faint", className: "rt-glass" });
const WALLS = {
  farX: rect(WALL_OUT.x, INSIDE.y, INSIDE.x, INSIDE.y + INSIDE.d),
  farY: rect(INSIDE.x, WALL_OUT.y, INSIDE.x + INSIDE.w, INSIDE.y),
  nearX: rect(INSIDE.x + INSIDE.w, INSIDE.y, WALL_OUT.x + WALL_OUT.w, INSIDE.y + INSIDE.d),
  nearY: rect(INSIDE.x, INSIDE.y + INSIDE.d, INSIDE.x + INSIDE.w, WALL_OUT.y + WALL_OUT.d),
};
mid.push(glassWall(WALLS.farX), glassWall(WALLS.farY));
{
  // Foam beach: four sloped faces from just under the water line at the walls down to the floor.
  const x0 = INSIDE.x;
  const x1 = INSIDE.x + INSIDE.w;
  const y0 = INSIDE.y;
  const y1 = INSIDE.y + INSIDE.d;
  const top = Z.water - 1.2;
  const toe = Z.floor + 0.2;
  const b = BEACH;
  const faces = [
    { pts: [[x0, y0, top], [x1, y0, top], [x1 - b, y0 + b, toe], [x0 + b, y0 + b, toe]], shade: 2 },
    { pts: [[x0, y1, top], [x0, y0, top], [x0 + b, y0 + b, toe], [x0 + b, y1 - b, toe]], shade: 3 },
    { pts: [[x1, y0, top], [x1, y1, top], [x1 - b, y1 - b, toe], [x1 - b, y0 + b, toe]], shade: 1 },
    { pts: [[x1, y1, top], [x0, y1, top], [x0 + b, y1 - b, toe], [x1 - b, y1 - b, toe]], shade: 0 },
  ];
  const parts = faces.map(({ pts, shade }) => `<path class="iso-shade" data-shade="${shade}" d="${path3(pts, true)}"/>`);
  const toeLine = path3([[x0 + b, y0 + b, toe], [x1 - b, y0 + b, toe], [x1 - b, y1 - b, toe], [x0 + b, y1 - b, toe]], true);
  const seams = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => path3([[x, y, top], [x + Math.sign(-x) * b, y + Math.sign(-y) * b, toe]])).join("");
  const foam = [];
  for (const share of [0.35, 0.7]) {
    const z = top + (toe - top) * share;
    const inset = b * share;
    foam.push(path3([[x0 + inset, y0 + inset, z], [x1 - inset, y0 + inset, z], [x1 - inset, y1 - inset, z], [x0 + inset, y1 - inset, z]], true));
  }
  mid.push(`<g class="rt-beach">${parts.join("")}${L(foam.join(""), { tone: "faint", dotted: true })}${L(seams, { tone: "faint" })}${L(toeLine, { tone: "lo" })}</g>`);
}
mid.push(`<g class="iso-solid rt-water"><path class="iso-fill" d="${k.planOutline(INSIDE, Z.water, P)}"/></g>`);

// =====================================================================
// Front SVG: caps, bridge, bar, dippers, motor, near frame and glass, beam.
// =====================================================================
const front = [];
const CAP_W = 7;
const capPlan = (name) => {
  const wall = WALLS[name];
  if (name === "farX" || name === "nearX") {
    const cx = wall.x + wall.w / 2;
    return rect(cx - CAP_W / 2, OUTSIDE.y + POST_SIZE, cx + CAP_W / 2, OUTSIDE.y + OUTSIDE.d - POST_SIZE, 0.6);
  }
  const cy = wall.y + wall.d / 2;
  return rect(OUTSIDE.x + POST_SIZE, cy - CAP_W / 2, OUTSIDE.x + OUTSIDE.w - POST_SIZE, cy + CAP_W / 2, 0.6);
};
const cap = (name) => slab(capPlan(name), Z.rim, Z.cap, { tone: "hi", crease: "faint" }, 0.5);
front.push(cap("farX"), cap("farY"));

// Motor cable, bridge run: from the near rim up past the pillar to the motor's back.
const RIM_RUN_END = [DIP_X - 12, INSIDE.y + INSIDE.d + 2, Z.cap + 1.4];
front.push(
  tube(
    [RIM_RUN_END, ...curve([DIP_X - 15, INSIDE.y + INSIDE.d - 4, Z.cap + 6], [DIP_X - 26, 40, 300], [MOTOR.x0 - 1, 4, MOTOR.z]).slice(0, -1), [MOTOR.x0 - 1, 2, MOTOR.z], [MOTOR.x0 + 2, 1.5, MOTOR.z]],
    1.4,
    "mid",
    { caps: [false, false] },
  ),
);

// Pillars and springs.
const pillarPlan = (sy) => rect(DIP_X - PILLAR.half, sy * PILLAR.y - PILLAR.w, DIP_X + PILLAR.half, sy * PILLAR.y + PILLAR.w, 0.8);
const pillar = (sy) => [
  slab(rect(DIP_X - PILLAR.half - 3, sy * PILLAR.y - PILLAR.w - 1, DIP_X + PILLAR.half + 3, sy * PILLAR.y + PILLAR.w + 1, 1), Z.cap, Z.cap + 4, { tone: "hi", crease: "faint" }, 0.6),
  slab(pillarPlan(sy), Z.cap + 4, BEAM.z[0], { tone: "hi", crease: "faint" }, 0.6),
  L(k.ring(DIP_X, sy * PILLAR.y, 2.2, Z.cap + 4.01, P, 16), { tone: "mid" }),
].join("");
const springOf = (sy) => springPaths(DIP_X, sy * SPRING_Y, 3.8, BAR.z[1] + 1.5, BEAM.z[0] - 1.5, 7);
const springHooks = (sy) => rod(DIP_X, sy * SPRING_Y, 2.4, BEAM.z[0] - 2, BEAM.z[0], { tone: "hi" }, 16);
const springFar = springOf(-1);
const springNear = springOf(1);
front.push(pillar(-1), springHooks(-1), L(springFar.back, { tone: "mid" }), L(springFar.front, { tone: "hi" }));

// Vibrating bar with ticks; it bobs with the dippers.
{
  const plan = rect(DIP_X - BAR.half, -BAR.y, DIP_X + BAR.half, BAR.y, 1);
  const ticks = k.topTicks(-BAR.y + 4, BAR.y - 4, 4, 5, DIP_X + BAR.half, BAR.z[1], [-2, -4], P, "y");
  const nuts = [-1, 1].map((sy) => rod(DIP_X, sy * SPRING_Y, 2.6, BAR.z[1], BAR.z[1] + 1.6, { tone: "hi" }, 16)).join("");
  front.push(`<g data-part="bar">${slab(plan, BAR.z[0], BAR.z[1], { tone: "hi", crease: "faint" }, 0.6)}${L(ticks.minor, { tone: "faint" })}${L(ticks.major, { tone: "lo" })}${nuts}</g>`);
}

// Dippers: clamp, stem and ball, drawn at y = 0 and placed by transform.
const dipperSvg = (name, y) => {
  const clamp = slab(rect(DIP_X - BAR.half - 1.6, -3.2, DIP_X + BAR.half + 1.6, 3.2, 0.6), BAR.z[0] - 2, BAR.z[1] + 2.5, { tone: "hi", crease: "faint" }, 0.4);
  const screw = xCylinderSvg(DIP_X + BAR.half + 1.6, DIP_X + BAR.half + 4, 0, BAR.z[1] - 1, 1.3, { tone: "hi" });
  const stem = rod(DIP_X, 0, 0.9, BALL_Z + BALL.r - 0.6, BAR.z[0] - 2, { tone: "hi" }, 12);
  const c = at([DIP_X, 0, BALL_Z]);
  const r = (BALL.r * k.cameraOf(P).k).toFixed(2);
  const ball = `<g class="iso-solid rt-ball" data-lit=""><circle class="iso-fill" cx="${c[0].toFixed(2)}" cy="${c[1].toFixed(2)}" r="${r}"/><path class="iso-line" data-tone="faint" d="${k.sideArc(DIP_X, 0, BALL.r * 0.7, BALL_Z + BALL.r * 0.55, P, 12)}"/><circle class="iso-line iso-edge" data-tone="lit" cx="${c[0].toFixed(2)}" cy="${c[1].toFixed(2)}" r="${r}"/></g>`;
  return `<g data-part="${name}" transform="${k.translateAlong(P, [0, y, 0])}">${stem}${ball}${clamp}${screw}</g>`;
};
front.push(dipperSvg("dipper-far", -M.START.d / 2));

// Motor on its saddle, with shaft and eccentric.
{
  const saddle = slab(rect(DIP_X - 8, -11, DIP_X + 8, 11, 1), BAR.z[1], BAR.z[1] + 6, { tone: "hi", crease: "faint" }, 0.5);
  const body = xCylinderSvg(MOTOR.x0, MOTOR.x1, 0, MOTOR.z, MOTOR.r, { tone: "hi" });
  const ribs = [MOTOR.x0 + 5, MOTOR.x0 + 9, MOTOR.x0 + 13].map((x) => k.sideRing([x, 0, MOTOR.z], MOTOR.r, "x", P, 36)).join("");
  const boss = xCylinderSvg(MOTOR.x1, MOTOR.x1 + 1.6, 0, MOTOR.z, 3.6, { tone: "hi" });
  const shaft = xCylinderSvg(SHAFT.x0 + 1.6, SHAFT.x1, 0, MOTOR.z, SHAFT.r, { tone: "hi" });
  const disc = xCylinderSvg(ECCENTRIC.x - 1, ECCENTRIC.x + 1, 0, MOTOR.z, ECCENTRIC.r + ECCENTRIC.offset, { tone: "mid" });
  front.push(`<g data-part="motor">${saddle}${body}<path class="iso-line" data-tone="faint" d="${ribs}"/>${boss}${shaft}${disc}<path class="iso-line" data-tone="hi" data-part="eccentric" d=""/></g>`);
}
front.push(dipperSvg("dipper-near", M.START.d / 2));
front.push(springHooks(1), L(springNear.back, { tone: "mid" }), L(springNear.front, { tone: "hi" }));

// Near rails, glass bottom outline, water edge lines and near glass.
front.push(slab(RAILS.nearX, RAIL_Z[0], RAIL_Z[1], { tone: "hi", crease: "faint" }, 0.6));
front.push(slab(RAILS.nearY, RAIL_Z[0], RAIL_Z[1], { tone: "hi", crease: "faint" }, 0.6));
front.push(L(k.sideSeam(WALL_OUT, Z.bed, P) + k.sideSeam(WALL_OUT, Z.floor, P), { tone: "mid" }));
{
  const x1 = INSIDE.x + INSIDE.w;
  const y1 = INSIDE.y + INSIDE.d;
  const waterLines = path3([[x1, INSIDE.y, Z.water], [x1, y1, Z.water], [INSIDE.x, y1, Z.water]]) + path3([[INSIDE.x, INSIDE.y, Z.water], [x1, INSIDE.y, Z.water]]) + path3([[INSIDE.x, INSIDE.y, Z.water], [INSIDE.x, y1, Z.water]]);
  front.push(L(waterLines, { tone: "lo" }));
  front.push(L(path3([[WALL_OUT.x + WALL_OUT.w, INSIDE.y, Z.water], [WALL_OUT.x + WALL_OUT.w, WALL_OUT.y + WALL_OUT.d, Z.water], [INSIDE.x, WALL_OUT.y + WALL_OUT.d, Z.water]]), { tone: "faint" }));
}
front.push(glassWall(WALLS.nearX), glassWall(WALLS.nearY));
front.push(cap("nearX"), cap("nearY"));

// Motor cable, rim run: along the near y cap from the corner post to the bridge.
front.push(tube([[CORNER_X + 3, POST_FACE_Y - 4, Z.cap + 1.4], [CORNER_X + 10, INSIDE.y + INSIDE.d + 2, Z.cap + 1.4], RIM_RUN_END], 1.4, "mid", { caps: [false, false] }));
front.push(cornerPost(1, 1));
front.push(pillar(1));

// The bridge beam across the tank.
{
  const plan = rect(DIP_X - BEAM.half, -BEAM.y, DIP_X + BEAM.half, BEAM.y, 1.2);
  front.push(slab(plan, BEAM.z[0], BEAM.z[1], { tone: "hi", crease: "faint" }, 0.8));
  front.push(L([-1, 1].map((sy) => k.ring(DIP_X, sy * PILLAR.y, 2, BEAM.z[1] + 0.01, P, 14)).join(""), { tone: "mid" }));
}

// =====================================================================
// Page
// =====================================================================
const r1 = (v) => Math.round(v * 10) / 10;
const LABEL =
  "A school ripple tank, drawn in isometric. A base plate carries a sheet of paper taped at its corners. High above the paper, a shallow tank with a glass bottom stands on four tall legs with knurled levelling screws and threaded feet. " +
  "A post behind the tank holds an arm that reaches over its centre, where a strobe lamp shines straight down. A bridge across the tank carries a vibrating bar on two coil springs, shaken by a small motor with an eccentric on its shaft, and two point dippers on the bar touch the water. " +
  "A control box on the base beside the paper sets the frequency. The two sets of circular waves interfere; the water surface sheen moves with them, and the lamp projects the pattern onto the paper as bright crests and grey nodal lines.";

const CAPTION =
  `A strobe lamp shines down through a tank of 6 mm deep water, where two dippers on one vibrating bar touch the surface in phase. ` +
  `The lamp flashes ${M.BEAT} times a second slower than the dipping, so the waves seem to crawl outward at ${M.BEAT} Hz: honest slow motion. ` +
  `They are capillary-gravity waves, ω² = (gk + σk³/ρ) tanh kh; at ${M.START.f} Hz the wavelength is ${(STATE0.wavelength / 10).toFixed(2)} cm and the phase speed about ${Math.round(STATE0.phase * 100)} cm/s. ` +
  `The interference leaves 2⌊d/λ + ½⌋ nodal lines, ${STATE0.nodal} at ${M.START.d / 10} cm spacing and ${M.START.f} Hz. ` +
  `One wavelength out a crest stands only about ${STATE0.amplitude.toFixed(3)} mm high (ka = ${M.STEEPNESS}), yet it is a weak lens: with the lamp ${((LAMP[2] - Z.water) / 10).toFixed(1)} cm above the water and the paper ${r1((Z.water - Z.paper) / 10)} cm below it, the shadow is ${optics.magnification.toFixed(2)}× life size, and the paper sits ${STATE0.focus.toFixed(2)} of a crest's focal length down at ${M.START.f} Hz and ${M.stateOf(28, M.START.d, optics).focus.toFixed(2)} at 28 Hz. ` +
  `Near the dippers the light passes through focus and the crests draw sharp bright lines; the grey bands between them are the nodal lines. ` +
  `A sloped foam beach inside the walls soaks up the waves so they don't reflect. The only damping is the viscosity of clean water, so these ripples carry farther than in a real tank with a surface film.`;

const keys = [
  { mark: "lit", label: "Sources: two dippers, in phase" },
  { mark: "raised", label: "Tank on its legs, bridge and vibrating bar" },
  { mark: "flat", label: `Paper, ${r1((Z.water - Z.paper) / 10)} cm below the water; the pattern on it is ${optics.magnification.toFixed(2)}× life size` },
];

const svgLayer = (className, body) => `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg rt-layer ${className}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${body.join("")}</svg>`;
const backSvg = k.figureSvg({ width: W, height: H, label: LABEL, body: back, className: "rt-back" });
const stage =
  `<div class="rt-stage" tabindex="0" role="group" aria-roledescription="ripple tank control" aria-label="Ripple tank. Move the pointer across the tank to set the frequency, and up or down to set the spacing of the dippers. Left and right arrows change the frequency, up and down arrows change the spacing, and Shift takes bigger steps.">` +
  `<span class="rt-said" aria-live="polite"></span>` +
  backSvg +
  `<canvas class="rt-layer rt-gl rt-paper-gl" aria-hidden="true"></canvas>` +
  svgLayer("rt-mid", mid) +
  `<canvas class="rt-layer rt-gl rt-water-gl" aria-hidden="true"></canvas>` +
  svgLayer("rt-front", front) +
  `</div>`;

const plain = (plan) => [plan.x + plan.w / 2, plan.y + plan.d / 2, plan.w / 2, plan.d / 2];
const DATA = {
  W,
  H,
  P,
  camera: glCamera(P),
  range: M.RANGE,
  start: M.START,
  optics,
  beat: M.BEAT,
  ka: M.STEEPNESS,
  reach: M.REACH,
  step: 0.05,
  startPhase: START_PHASE,
  pattern: PATTERN_GEOMETRY,
  z: Z,
  lamp: [...LAMP, LAMP_RADIUS],
  inside: plain(INSIDE),
  outside: plain(OUTSIDE),
  paper: plain(PAPER),
  base: plain(BASE),
  round: [INSIDE.r, OUTSIDE.r, PAPER.r, BASE.r],
  leg: [LEG.x, LEG.y, LEG.r + 0.6, LEG.top],
  post: [POST.x, POST.y, POST.r, POST.top],
  bar: [DIP_X, 0, BAR.half, BAR.y],
  beam: [DIP_X, 0, BEAM.half, BEAM.y],
  motor: [DIP_X - 1, 0, 12, 11],
  box: plain(BOX),
  heights: [(BAR.z[0] + BAR.z[1]) / 2, (BEAM.z[0] + BEAM.z[1]) / 2, MOTOR.z, BOX_TOP],
  near: [WALL_OUT.x + WALL_OUT.w, WALL_OUT.y + WALL_OUT.d, Z.rim, Z.cap],
  dip: [DIP_X, BALL.r * 0.42, BEACH, 0.28],
  dipZ: BALL_Z,
  knob: [KNOB.x, KNOB.y, KNOB.top, KNOB.r],
  meter: [METER.x, METER.y, BOX_TOP + 1.24, METER.r - 3.5],
  eccentric: [ECCENTRIC.x + 1.05, 0, MOTOR.z, ECCENTRIC.offset, ECCENTRIC.r],
  boxTop: BOX_TOP,
};

const CSS = readFileSync(join(HERE, "ripple.css"), "utf8");
const MODEL = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__RIPPLE_DATA__", JSON.stringify(DATA));
const body = `<style>${CSS}</style><div class="rt">${k.plateHtml({
  fig: "Fig 3",
  title: "Ripple tank",
  hint: "Across sets f · up and down sets spacing",
  readout: M.readoutOf(STATE0),
  keys,
  caption: CAPTION,
  body: stage,
})}</div>`;
const page = k.pageHtml({ title: "Ripple tank", theme: THEME, body, script: kitScript() + glScript() + MODEL + "\n" + LIVE, width: 760 });
writeFileSync(join(HERE, OUT), page);
console.log(
  "wrote",
  OUT,
  `${(page.length / 1024).toFixed(0)} KB`,
  "3 svg layers + 2 canvases",
  `magnification ${optics.magnification.toFixed(3)}`,
  `caustic ${optics.caustic.toFixed(2)} mm`,
  `focus ${STATE0.focus.toFixed(3)} at ${M.START.f} Hz, ${M.stateOf(28, M.START.d, optics).focus.toFixed(3)} at 28 Hz`,
);
