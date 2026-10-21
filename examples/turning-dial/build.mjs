// Turning dial: the kit's optional 3D mode on a combination dial.
//
// A safe-style dial sits on a raised door plate. Its knurled skirt drives a pinion
// under the plate, which turns an index wheel seen through a window at a quarter of
// the dial's rate. A pawl on a post rides the knurl. A small robot hand rests on the
// hub and turns with the dial; its middle finger lifts on three hinges, and a hex pod
// on its back can break off, tumble and land on the face. Every live part is drawn
// again each frame from the kit's own rules.
//
//   node build.mjs                      -> turning-dial.html
//   node build.mjs --light              -> turning-dial-light.html
//   node build.mjs --light --verify     -> turning-dial-verify-light.html (recorded shapes for turn-check --order)
//   node build.mjs --light --audit [--quick] [--only=order,routes] [--verbose]
//
// Importing this module builds the scene (P, T, follow, poses …) and writes nothing.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import * as G from "../../kit/lathe.mjs";
import * as A from "../../kit/audit.mjs";
import { turning } from "../../kit/turn-build.mjs";
import * as TA from "../../kit/turn-audit.mjs";
import { glCamera } from "../../kit/gl.mjs";
import { turnScript, glScript } from "../../scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const MAIN = Boolean(process.argv[1]) && resolve(process.argv[1]) === SELF;
const FLAGS = MAIN ? process.argv.slice(2) : [];
const has = (flag) => FLAGS.includes(flag);
const LIGHT = has("--light");
const VERIFY = has("--verify");

const W = 640;
const H = 470;
const RAD = Math.PI / 180;

// ---------------------------------------------------------------------------
// Layout, world units, z up. The dial turns about the z axis through the origin.
const BASE = { x: -53, y: -56, w: 122, d: 112, r: 9 };
const BASE_TOP = 7;
const PLATE = { x: -48, y: -51, w: 112, d: 102, r: 6 };
const PLATE_Z = 14;
const PLATE_TOP = 17;
const DIAL_R = 40;
const DIAL_Z = 18.5;
const SKIRT_TOP = 23.5;
const FACE_Z = 25;
const FACE_R = 38;
const HUB_R = 7.5;
const HUB_TOP = 28.5;
const INDEX_AT = 68.4; // degrees: the direction from the dial centre to the index
const PINION_R = 6;
const WHEEL_R = 24;
const WHEEL_AT = 28; // degrees: the direction from the dial centre to the wheel centre
const WHEEL_C = [(PINION_R + WHEEL_R) * Math.cos(WHEEL_AT * RAD), (PINION_R + WHEEL_R) * Math.sin(WHEEL_AT * RAD)];
const LOCK_Z = 9.5;
const LOCK_TOP = 13.2;
const NUMERAL_R = 19.5; // on the wheel
const PAWL_AT = 290;
const PAWL_ARM = 7;
const NOSE_R = 1;
const PAWL_PIVOT = [(DIAL_R + NOSE_R + PAWL_ARM) * Math.cos(PAWL_AT * RAD), (DIAL_R + NOSE_R + PAWL_ARM) * Math.sin(PAWL_AT * RAD)];
const PAWL_Z = 20;

// Engraved numerals as stroked paths, so a turning face carries no hinted text that snaps
// from pixel to pixel. Glyphs are drawn in a 1 × 1.6 cell, y down.
const GLYPHS = {
  0: "M0.5 0A0.47 0.8 0 1 1 0.5 1.6A0.47 0.8 0 1 1 0.5 0Z",
  1: "M0.22 0.32L0.55 0L0.55 1.6M0.22 1.6L0.88 1.6",
  2: "M0.06 0.36Q0.12 0 0.5 0Q0.94 0 0.94 0.42Q0.94 0.74 0.06 1.6L0.94 1.6",
  3: "M0.06 0.22Q0.28 0 0.5 0Q0.92 0 0.92 0.4Q0.92 0.78 0.46 0.78Q0.94 0.78 0.94 1.18Q0.94 1.6 0.5 1.6Q0.2 1.6 0.06 1.38",
  4: "M0.72 1.6L0.72 0L0.05 1.1L0.95 1.1",
  5: "M0.9 0L0.16 0L0.09 0.72Q0.3 0.6 0.5 0.6Q0.94 0.6 0.94 1.1Q0.94 1.6 0.5 1.6Q0.2 1.6 0.06 1.38",
  6: "M0.86 0.16Q0.7 0 0.5 0Q0.06 0 0.06 0.9Q0.06 1.6 0.5 1.6Q0.94 1.6 0.94 1.1Q0.94 0.64 0.5 0.64Q0.16 0.64 0.06 0.94",
  7: "M0.06 0L0.94 0L0.4 1.6",
  8: "M0.5 0A0.4 0.38 0 1 1 0.5 0.76A0.4 0.38 0 1 1 0.5 0ZM0.5 0.76A0.45 0.42 0 1 1 0.5 1.6A0.45 0.42 0 1 1 0.5 0.76Z",
  9: "M0.14 1.44Q0.3 1.6 0.5 1.6Q0.94 1.6 0.94 0.7Q0.94 0 0.5 0Q0.06 0 0.06 0.5Q0.06 0.96 0.5 0.96Q0.84 0.96 0.94 0.66",
};
// Kit paths keep their stroke width on screen (non-scaling), so `weight` is in viewBox px.
function numeralSvg(text, x, y, turn, height, weight) {
  const size = height / 1.6;
  const width = text.length + (text.length - 1) * 0.3;
  const d = [...text].map((digit, i) => `<path transform="translate(${(i * 1.3 - width / 2).toFixed(2)} -0.8)" d="${GLYPHS[digit]}"/>`).join("");
  return `<g class="td-digit" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${turn.toFixed(1)}) scale(${size.toFixed(3)})" style="stroke-width:${weight}">${d}</g>`;
}

// Knurl rows on a turned part, with a seam at each end of the rows for the ribs to stop on.
const knurl = (s0, s1, count) => ({ ribs: { s0, s1, count, tone: "lo" }, seams: [s0, s1] });
const UP = (x, y) => ({ o: [x, y, 0], a: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] });
const along = (o, a) => G.frameAlong(o, a);
const add = G.add3;
const sub = G.sub3;
const mul = G.mul3;
const unit = G.unit3;

export const P = k.fitProjection([...k.boxCorners(BASE, 0, PLATE_TOP), [0, 0, 47], [-30, -30, 44], [30, 30, 44]], W, H, { pad: 22, azimuth: 40, elevation: 31 });
export const R = A.recorder(P);
export const T = turning(P, { recorder: R });

// Groups. The dial must be the first turn group: a bare number turns it.
const dial = T.group("dial", { turn: { pivot: [0, 0] } });
const wheel = T.group("wheel", { turn: { pivot: WHEEL_C } });
const pawl = T.group("pawl", { hinge: { point: [PAWL_PIVOT[0], PAWL_PIVOT[1], PAWL_Z], axis: [0, 0, 1], range: [-4, 4] } });

const lock = T.layer("lock");
const face = T.layer("dial");
const hand = T.layer("hand");
T.stack(["back", "lock", "mid", "dial", "hand", "front"]);

// ---------------------------------------------------------------------------
// Motion. These three functions are inlined into the page, so they use only MOTION and Math.
const MOTION = {
  lift: { "f2.mcp": -22, "f2.pip": -14, "f2.dip": -9 },
  pawl: { swing: 3.6, per: 8 },
  tap: { period: 4, rise: 0.7, hold: 0.9, fall: 0.7 },
  pod: null, // filled once the pod is placed
};

export function follow(values) {
  const out = { ...values };
  const turn = Number(out.dial ?? 0) || 0;
  const lift = Math.max(0, Math.min(1, Number(out.lift ?? 0) || 0));
  out.dial = turn;
  out.lift = lift;
  out.wheel = -turn / 4;
  out.pawl = MOTION.pawl.swing * Math.sin((turn * MOTION.pawl.per * Math.PI) / 180);
  for (const [name, limit] of Object.entries(MOTION.lift)) out[name] = limit * lift;
  if (out.pod === undefined) out.pod = null;
  return out;
}

export function tapAt(time) {
  const { period, rise, hold, fall } = MOTION.tap;
  const t = ((time % period) + period) % period;
  const ease = (x) => {
    const u = Math.max(0, Math.min(1, x));
    return u * u * (3 - 2 * u);
  };
  if (t < rise) return ease(t / rise);
  if (t < rise + hold) return 1;
  if (t < rise + hold + fall) return 1 - ease((t - rise - hold) / fall);
  return 0;
}

export function breakAt(time) {
  if (!(time > 0)) return null;
  const M = MOTION.pod;
  const t = Math.min(time, M.end);
  const turnAbout = (axis, angle) => {
    const [x, y, z] = axis;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const q = 1 - c;
    return [c + x * x * q, x * y * q - z * s, x * z * q + y * s, y * x * q + z * s, c + y * y * q, y * z * q - x * s, z * x * q - y * s, z * y * q + x * s, c + z * z * q];
  };
  const ease = (u) => u * u * (3 - 2 * u);
  if (t <= M.flight) {
    const u = t / M.flight;
    const spin = 2 * Math.PI * ease(u);
    return {
      R: turnAbout(M.axis, spin),
      t: [M.reach[0] * u, M.reach[1] * u, M.rise * t - (M.gravity * t * t) / 2],
    };
  }
  const u = (t - M.flight) / (M.end - M.flight);
  const slide = 1 - (1 - u) * (1 - u) * (1 - u);
  const shown = (1 - Math.exp(-M.decay * u)) / (1 - Math.exp(-M.decay));
  const share = 0.5 * slide + 0.5 * shown;
  return {
    R: turnAbout([0, 0, 1], M.yaw * share * (Math.PI / 180)),
    t: [M.reach[0] + M.slide[0] * share, M.reach[1] + M.slide[1] * share, M.drop],
  };
}

// ---------------------------------------------------------------------------
// Live parts: the lock (under the plate).
T.round({ name: "lock.pinion", group: dial, layer: lock, F: UP(0, 0), s0: LOCK_Z, s1: LOCK_TOP, r: PINION_R, material: "brass", details: knurl(LOCK_Z + 0.3, LOCK_TOP - 0.3, 24) });
const wheelPart = T.round({ name: "lock.wheel", group: wheel, layer: lock, F: UP(WHEEL_C[0], WHEEL_C[1]), s0: LOCK_Z, s1: LOCK_TOP, r: WHEEL_R, material: "steel", details: knurl(LOCK_Z + 0.3, LOCK_TOP - 0.3, 96) });
T.round({ name: "lock.cap", group: wheel, layer: lock, F: UP(WHEEL_C[0], WHEEL_C[1]), s0: LOCK_TOP, s1: LOCK_TOP + 0.6, r: 3.6, material: "brass" });

// The index wheel's face: ticks every 3.6° and a numeral every 36°.
{
  const marks = [];
  for (let i = 0; i < 100; i++) {
    const a = (WHEEL_AT + 18 + i * 3.6) * RAD;
    const long = i % 10 === 0 ? 3 : i % 5 === 0 ? 2 : 1.2;
    marks.push([[WHEEL_R * Math.cos(a), WHEEL_R * Math.sin(a)], [(WHEEL_R - long) * Math.cos(a), (WHEEL_R - long) * Math.sin(a)]]);
  }
  const ticks = marks.map(([p, q]) => `M${p[0].toFixed(2)} ${p[1].toFixed(2)}L${q[0].toFixed(2)} ${q[1].toFixed(2)}`).join("");
  const text = [];
  for (let n = 0; n < 10; n++) {
    const a = WHEEL_AT + n * 36;
    const x = NUMERAL_R * Math.cos(a * RAD);
    const y = NUMERAL_R * Math.sin(a * RAD);
    text.push(numeralSvg(String(n), x, y, a - 90, 3.6, 1.4));
  }
  T.plane({ part: wheelPart, o: [WHEEL_C[0], WHEEL_C[1], LOCK_TOP], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1], svg: `<path class="iso-line" data-tone="lo" data-free="end" d="${ticks}"/>${text.join("")}` });
}

// The dial (its own live layer, under the hand, so a shader can light its face).
const skirt = T.round({ name: "dial.body", group: dial, layer: face, F: UP(0, 0), s0: DIAL_Z, s1: SKIRT_TOP, r: DIAL_R, material: "steel", details: knurl(DIAL_Z + 0.5, SKIRT_TOP - 0.5, 120) });
void skirt;
const dialFace = T.round({ name: "dial.face", group: dial, layer: face, F: UP(0, 0), s0: SKIRT_TOP, s1: FACE_Z, r: [DIAL_R, FACE_R], tone: "hi" });
{
  const lines = [];
  for (let i = 0; i < 100; i++) {
    const a = (3.6 * i - 90) * RAD;
    const long = i % 10 === 0 ? 2.8 : i % 5 === 0 ? 2 : 1.2;
    const p = [FACE_R * Math.cos(a), FACE_R * Math.sin(a)];
    const q = [(FACE_R - long) * Math.cos(a), (FACE_R - long) * Math.sin(a)];
    lines.push(`M${p[0].toFixed(2)} ${p[1].toFixed(2)}L${q[0].toFixed(2)} ${q[1].toFixed(2)}`);
  }
  const text = [];
  for (let n = 0; n < 100; n += 10) {
    const a = 3.6 * n - 90;
    const x = 33 * Math.cos(a * RAD);
    const y = 33 * Math.sin(a * RAD);
    text.push(numeralSvg(String(n), x, y, a - 90, 2.6, 1.15));
  }
  T.plane({ part: dialFace, o: [0, 0, FACE_Z], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1], svg: `<path class="iso-line" data-tone="lo" data-free="end" d="${lines.join("")}"/>${text.join("")}` });
}

// The pawl: an arm on a post behind the dial, its nose against the knurl.
{
  const inward = unit([-Math.cos(PAWL_AT * RAD), -Math.sin(PAWL_AT * RAD), 0]);
  const side = [-inward[1], inward[0], 0];
  const F = { o: [PAWL_PIVOT[0], PAWL_PIVOT[1], 0], a: [0, 0, 1], u: inward, v: side };
  const reach = PAWL_ARM - NOSE_R;
  T.prism({ name: "pawl.arm", group: pawl, layer: face, F, polygon: [[-1.6, -1.4], [reach, -0.8], [reach, 0.8], [-1.6, 1.4]], s0: PAWL_Z, s1: PAWL_Z + 1.6, material: "brass", bevel: 0.3 });
  T.round({ name: "pawl.nose", group: pawl, layer: face, F: UP(PAWL_PIVOT[0] + inward[0] * PAWL_ARM, PAWL_PIVOT[1] + inward[1] * PAWL_ARM), s0: PAWL_Z, s1: PAWL_Z + 1.6, r: NOSE_R, material: "brass" });
  T.round({ name: "pawl.boss", group: pawl, layer: face, F: UP(PAWL_PIVOT[0], PAWL_PIVOT[1]), s0: PAWL_Z + 1.6, s1: PAWL_Z + 2.4, r: 1.3, material: "gunmetal" });
}

// ---------------------------------------------------------------------------
// The hand. Dial rest coordinates: the fingers point along +x.
const PALM = { x: -16, y: -11, w: 26, d: 22, r: 2.5 };
const PALM_TOP = HUB_TOP + 3.5;
const KNUCKLE_Z = (HUB_TOP + PALM_TOP) / 2;
const LINK_R = 1.25;
const GAP_C = 1.5; // dome centres sit this far from their joint
const DISC_R = 1.7;
const DISC_T = 0.5;
const CABLE_Z = 34.5;
const CABLE_R = 0.6;

T.round({ name: "dial.hub", group: dial, layer: hand, F: UP(0, 0), s0: FACE_Z, s1: HUB_TOP, r: HUB_R, material: "steel", details: { seams: [FACE_Z + 1] } });
T.prism({ name: "hand.palm", group: dial, layer: hand, plan: PALM, z: HUB_TOP, h: PALM_TOP - HUB_TOP, bevel: 0.8, material: "gold", details: { dots: [[7.5, -8.5], [7.5, 8.5]].map(([x, y]) => ({ at: [PALM_TOP, x, y], normal: [0, 0, 1], size: 0.55, tone: "lo" })) } });
for (const [index, y] of [-8.5, 8.5].entries()) T.round({ name: `hand.palm.bolt${index ? "b" : "a"}`, group: dial, layer: hand, F: UP(-13.5, y), s0: PALM_TOP, s1: PALM_TOP + 0.6, r: 1, material: "steel" });
const COVER = { x: -2, y: -5.5, w: 10, d: 11, r: 1.5 };
const COVER_TOP = PALM_TOP + 1.2;
T.prism({ name: "hand.cover", group: dial, layer: hand, plan: COVER, z: PALM_TOP, h: COVER_TOP - PALM_TOP, bevel: 0.4, material: "chrome", details: { dots: [[-0.8, -4.3], [-0.8, 4.3], [6.8, -4.3], [6.8, 4.3]].map(([x, y]) => ({ at: [COVER_TOP, x, y], normal: [0, 0, 1], size: 0.45, tone: "lo" })) } });
const SOCKET = [3.5, 0];
const SOCKET_TOP = COVER_TOP + 1;
const socket = T.round({ name: "hand.pod.socket", group: dial, layer: hand, F: UP(SOCKET[0], SOCKET[1]), s0: COVER_TOP, s1: SOCKET_TOP, r: 2.4, material: "brass" });
void socket;
T.round({ name: "hand.wrist", group: dial, layer: hand, F: along([PALM.x, 0, KNUCKLE_Z], [-1, 0, 0]), s0: 0, s1: 2.4, r: 2.6, material: "steel", details: { seams: [0.8] } });

// Connector block with three ports, two clamps, a terminal, two junctions on the outer fingers.
const BLOCK = { x: -9.5, y: -8.6, w: 4.5, d: 17.2, r: 0.6 };
T.prism({ name: "hand.block", group: dial, layer: hand, plan: BLOCK, z: PALM_TOP, h: 4.2, bevel: 0.3, material: "gunmetal" });
const FRONT_X = BLOCK.x + BLOCK.w;
const BACK_X = BLOCK.x;
const JUNCTION_X = 14;
// The terminal stands on the wrist's top line, close to the axis (a tall block far out would
// sweep its vertical edges across the pixel grid fast enough to read as a stutter).
const WRIST_TOP = KNUCKLE_Z + 2.6;
const TERMINAL = { x: PALM.x - 2.3, y: -1.2, w: 2.1, d: 2.4, r: 0.4 };

function cable(name, hue, start, end, { clamp = null } = {}) {
  const dir = unit(sub(end, start));
  const total = G.len3(sub(end, start));
  const port = 1.2;
  const gaps = [[0, port], [total - 1, total]];
  T.round({ name: `hand.port.${hue}`, owner: name, group: dial, layer: hand, F: along(start, dir), s0: 0, s1: port, r: 0.95, material: "brass" });
  if (clamp) gaps.push(clamp.span);
  T.tube({ name, group: dial, layer: hand, route: [start, end], r: CABLE_R, hue, material: "rubber", gaps: gaps.sort((a, b) => a[0] - b[0]) });
  return { dir, total };
}

const LANE = 7;
for (const [sign, hue, finger] of [[-1, "red", "f1"], [1, "blue", "f3"]]) {
  const y = sign * LANE;
  const start = [FRONT_X, y, CABLE_Z];
  const end = [JUNCTION_X, y, CABLE_Z];
  const clampAt = [1, 3];
  const name = `cable.${hue}`;
  T.prism({ name: `hand.clamp.${hue}`, owner: name, group: dial, layer: hand, plan: { x: clampAt[0], y: y - 1.3, w: clampAt[1] - clampAt[0], d: 2.6, r: 0.4 }, z: PALM_TOP, h: CABLE_Z + 1.1 - PALM_TOP, material: "gunmetal" });
  cable(name, hue, start, end, { clamp: { span: [clampAt[0] - FRONT_X, clampAt[1] - FRONT_X] } });
  T.round({ name: `hand.${finger}.port`, owner: name, group: dial, layer: hand, F: along(end, [-1, 0, 0]), s0: 0, s1: 1, r: 0.95, material: "brass" });
}
{
  const start = [BACK_X, 0, CABLE_Z];
  const end = [TERMINAL.x + TERMINAL.w, 0, CABLE_Z];
  const clampAt = [-13.6, -12.6];
  T.prism({ name: "hand.clamp.green", owner: "cable.green", group: dial, layer: hand, plan: { x: clampAt[0], y: -1.3, w: clampAt[1] - clampAt[0], d: 2.6, r: 0.4 }, z: PALM_TOP, h: CABLE_Z + 1.1 - PALM_TOP, material: "gunmetal" });
  cable("cable.green", "green", start, end, { clamp: { span: [BACK_X - clampAt[1], BACK_X - clampAt[0]] } });
  T.round({ name: "hand.terminal.port", owner: "cable.green", group: dial, layer: hand, F: along(end, [1, 0, 0]), s0: 0, s1: 1, r: 0.95, material: "brass" });
  T.prism({ name: "hand.terminal", group: dial, layer: hand, plan: TERMINAL, z: WRIST_TOP, h: CABLE_Z + 1.8 - WRIST_TOP, bevel: 0.3, material: "gunmetal" });
  T.round({ name: "hand.terminal.cap", group: dial, layer: hand, F: UP(TERMINAL.x + TERMINAL.w / 2, TERMINAL.y + TERMINAL.d / 2), s0: CABLE_Z + 1.8, s1: CABLE_Z + 2.5, r: 1.2, material: "brass" });
}

// Fingers: links are capsules, joints are bridged by knuckle discs coaxial with the joint.
function capsule(name, group, from, to, { r = LINK_R, material = "steel", startAtJoint = true, endAtJoint = true, ends = ["dome", "dome"] } = {}) {
  const d = unit(sub(to, from));
  const a = startAtJoint ? add(from, mul(d, GAP_C)) : from;
  const b = endAtJoint ? sub(to, mul(d, GAP_C)) : to;
  return T.round({ name, group, layer: hand, F: along(a, d), s0: 0, s1: G.len3(sub(b, a)), r, ends, material });
}
function disc(name, group, at, axis, offset = LINK_R) {
  return T.round({ name, group, layer: hand, F: along(at, axis), s0: offset, s1: offset + DISC_T, r: DISC_R, material: "gunmetal" });
}
// A guide on a middle link: a flat block on the link's top line.
function guide(name, group, J1, J2) {
  const d2 = unit(sub(J2, J1));
  const n2 = [-d2[2], 0, d2[0]];
  const mid = add(mul(add(J1, J2), 0.5), mul(n2, LINK_R));
  return T.prism({ name, group, layer: hand, F: { o: mid, a: n2, u: d2, v: [0, 1, 0] }, polygon: [[-1.3, -0.55], [1.3, -0.55], [1.3, 0.55], [-1.3, 0.55]], s0: 0, s1: 0.7, material: "gunmetal" });
}
const FINGER = { lengths: [7, 6], slopes: [0, -14, -32] };
function fingerJoints(y) {
  const J0 = [PALM.x + PALM.w + DISC_R, y, KNUCKLE_Z];
  const dirOf = (deg) => [Math.cos(deg * RAD), 0, Math.sin(deg * RAD)];
  const J1 = add(J0, mul(dirOf(FINGER.slopes[0]), FINGER.lengths[0]));
  const J2 = add(J1, mul(dirOf(FINGER.slopes[1]), FINGER.lengths[1]));
  const d3 = dirOf(FINGER.slopes[2]);
  const drop = J2[2] - (FACE_Z + LINK_R + 0.001);
  const tip = add(J2, mul(d3, drop / -d3[2]));
  return { J0, J1, J2, tip, d3 };
}

export const TIPS = {};
for (const [finger, y] of [["f1", -LANE], ["f3", LANE]]) {
  const { J0, J1, J2, tip } = fingerJoints(y);
  TIPS[finger] = tip;
  capsule(`hand.${finger}.p1`, dial, J0, J1);
  capsule(`hand.${finger}.p2`, dial, J1, J2);
  capsule(`hand.${finger}.p3`, dial, J2, tip, { endAtJoint: false });
  guide(`hand.${finger}.guide`, dial, J1, J2);
  for (const [index, J] of [J0, J1, J2].entries()) {
    disc(`hand.${finger}.k${index}`, dial, J, [0, 1, 0]);
    disc(`hand.${finger}.k${index}b`, dial, J, [0, -1, 0]);
  }
  const top = KNUCKLE_Z + LINK_R;
  T.prism({ name: `hand.${finger}.junction`, group: dial, layer: hand, plan: { x: JUNCTION_X, y: y - 0.9, w: 3.4, d: 1.8, r: 0.3 }, z: top, h: CABLE_Z + 0.9 - top, material: "gunmetal" });
}

// The middle finger lifts on three hinges, chained under the dial.
export const LINKS = {};
export const LED = {};
{
  const { J0, J1, J2, tip, d3 } = fingerJoints(0);
  TIPS.f2 = tip;
  const axis = [0, 1, 0];
  const mcp = T.group("f2.mcp", { parent: dial, hinge: { point: J0, axis, range: [MOTION.lift["f2.mcp"], 0] } });
  const pip = T.group("f2.pip", { parent: mcp, hinge: { point: J1, axis, range: [MOTION.lift["f2.pip"], 0] } });
  const dip = T.group("f2.dip", { parent: pip, hinge: { point: J2, axis, range: [MOTION.lift["f2.dip"], 0] } });
  LINKS.p1 = capsule("hand.f2.p1", mcp, J0, J1, { material: "chrome" });
  LINKS.p2 = capsule("hand.f2.p2", pip, J1, J2, { material: "chrome" });
  LINKS.p3 = capsule("hand.f2.p3", dip, J2, tip, { endAtJoint: false, material: "chrome" });
  for (const [index, [J, g]] of [[J0, mcp], [J1, pip], [J2, dip]].entries()) {
    disc(`hand.f2.k${index}`, g, J, [0, 1, 0]);
    disc(`hand.f2.k${index}b`, g, J, [0, -1, 0]);
  }
  guide("hand.f2.guide", pip, J1, J2);
  // The LED lens sits on the fingertip link's top line, short of the dome.
  const n3 = [-d3[2], 0, d3[0]];
  const at = add(sub(tip, mul(d3, 1.1)), mul(n3, LINK_R + 0.05));
  LED.point = at;
  LED.dir = n3;
  LED.part = "hand.f2.p3";
  LED.group = "f2.dip";
  // The fallback stays inside the link's outline, so a change in paint order next to it shows nothing.
  const px = G.scaleOf(P);
  T.billboard({ part: LINKS.p3, at, normal: n3, fade: [0.05, 0.3], svg: `<g class="td-led"><circle class="td-led-halo" r="${(0.9 * px).toFixed(2)}"/><circle class="td-led-body" r="${(0.56 * px).toFixed(2)}"/><circle class="td-led-core" r="${(0.24 * px).toFixed(2)}"/></g>` });
}

// The thumb on a ball knuckle: one flat on the palm's side, the thumb's base on the other.
{
  const c = [4.5, PALM.y + PALM.d + 1.4, KNUCKLE_Z];
  const t1 = unit([0.55, 0.8, -0.1]);
  const t2 = unit([0.55, 0.8, -0.45]);
  T.ball({ name: "hand.thumb.ball", group: dial, layer: hand, c, r: 1.8, flats: [{ n: [0, -1, 0], d: 1.4 }, { n: t1, d: 1.2 }], material: "chrome" });
  const base = add(c, mul(t1, 1.2));
  const r = 1.1;
  const len1 = 5.5;
  T.round({ name: "hand.thumb.p1", group: dial, layer: hand, F: along(base, t1), s0: 0, s1: len1, r, ends: ["flat", "dome"], material: "steel" });
  const J = add(base, mul(t1, len1 + 1.4));
  const tipZ = FACE_Z + r + 0.001;
  const start = add(J, mul(t2, 1.4));
  const tip = add(start, mul(t2, (start[2] - tipZ) / -t2[2]));
  T.round({ name: "hand.thumb.p2", group: dial, layer: hand, F: along(start, t2), s0: 0, s1: G.len3(sub(tip, start)), r, ends: ["dome", "dome"], material: "steel" });
  const n = unit(G.cross3(t1, t2));
  T.round({ name: "hand.thumb.k1", group: dial, layer: hand, F: along(J, n), s0: r, s1: r + DISC_T, r: 1.8, material: "gunmetal" });
  TIPS.thumb = tip;
}

// The piston beside the palm: body on two saddles, the gland (the one lathe), rod, clevis, ball on a post.
const PISTON = { y: 16, z: 29, r: 2, back: -19, front: -7 };
{
  const { y, z, r, back, front } = PISTON;
  for (const [index, x] of [back + 2.5, front - 3].entries()) T.prism({ name: `hand.piston.saddle${index ? "b" : "a"}`, group: dial, layer: hand, plan: { x: x - 1.2, y: y - 2, w: 2.4, d: 4, r: 0.4 }, z: FACE_Z, h: z - r - FACE_Z, material: "gunmetal" });
  T.round({ name: "hand.piston.body", group: dial, layer: hand, F: along([back, y, z], [1, 0, 0]), s0: 0, s1: front - back, r, material: "steel", details: { seams: [1.2, front - back - 1.2] } });
  const gland = { s0: 0, s1: 1.5, r0: 1.7, r1: 1.15 };
  const bow = (gland.r0 - gland.r1) / (gland.s1 * gland.s1);
  const radius = (s) => gland.r0 - bow * s * s;
  const slope = (s) => -2 * bow * s;
  T.lathe({ name: "hand.piston.gland", group: dial, layer: hand, F: along([front, y, z], [1, 0, 0]), profile: [[0, radius(0)], [0.5, radius(0.5)], [1, radius(1)], [1.5, radius(1.5)]], radius, slope, material: "brass" });
  const rod0 = front + gland.s1;
  const rod1 = rod0 + 4.6;
  T.round({ name: "hand.piston.rod", group: dial, layer: hand, F: along([rod0, y, z], [1, 0, 0]), s0: 0, s1: rod1 - rod0, r: 0.6, material: "chrome" });
  T.prism({ name: "hand.piston.clevis", group: dial, layer: hand, plan: { x: rod1, y: y - 1.1, w: 2.2, d: 2.2, r: 0.3 }, z: z - 1.1, h: 2.2, material: "gunmetal" });
  const ball = [rod1 + 2.2 + 1.3, y, z];
  T.ball({ name: "hand.piston.ball", group: dial, layer: hand, c: ball, r: 1.3, material: "chrome" });
  T.round({ name: "hand.piston.post", group: dial, layer: hand, F: UP(ball[0], ball[1]), s0: FACE_Z, s1: z - 1.3, r: 0.8, material: "steel" });
}

// The hose: from a ferrule on the piston's back face, a flat quarter bend, into a valve.
{
  const { y, z, back } = PISTON;
  const bend = 7.5;
  const straight = 2.6;
  const centre = [back - straight, y - bend];
  const points = [[back, y, z]];
  for (let i = 0; i <= 24; i++) {
    const a = (90 + (90 * i) / 24) * RAD;
    points.push([centre[0] + bend * Math.cos(a), centre[1] + bend * Math.sin(a), z]);
  }
  const valveFace = centre[1] - straight;
  points.push([centre[0] - bend, valveFace, z]);
  const total = G.pathLength(points);
  T.round({ name: "hand.hose.ferrule", owner: "hand.hose", group: dial, layer: hand, F: along([back, y, z], [-1, 0, 0]), s0: 0, s1: 1.2, r: 1.05, material: "brass" });
  T.round({ name: "hand.valve.ferrule", owner: "hand.hose", group: dial, layer: hand, F: along([centre[0] - bend, valveFace, z], [0, 1, 0]), s0: 0, s1: 1.2, r: 1.05, material: "brass" });
  T.tube({ name: "hand.hose", group: dial, layer: hand, route: points, r: 0.75, turn: 30, material: "rubber", rings: { pitch: 1, tone: "lo" }, gaps: [[0, 1.2], [total - 1.2, total]] });
  const vx = centre[0] - bend;
  // The valve is a drum lying on the face with the hose entering its end, so it has no tall vertical edges.
  const drum = z - FACE_Z;
  T.round({ name: "hand.valve", group: dial, layer: hand, F: along([vx, valveFace, z], [0, -1, 0]), s0: 0, s1: 4.4, r: drum, material: "brass", details: { seams: [0.6, 3.8] } });
  T.round({ name: "hand.valve.knob", group: dial, layer: hand, F: UP(vx, valveFace - 2.2), s0: z + drum, s1: z + drum + 0.9, r: 1.3, material: "gunmetal", details: knurl(z + drum + 0.15, z + drum + 0.75, 14) });
}

// The pod: a hex nut and a domed cap on the socket. A free group under the dial.
export const POD_AT = [SOCKET[0], SOCKET[1], SOCKET_TOP + 1.3];
{
  const pod = T.group("pod", { parent: dial, free: { origin: POD_AT } });
  const hex = Array.from({ length: 6 }, (_, i) => [SOCKET[0] + 2.2 * Math.cos((i * 60 + 30) * RAD), SOCKET[1] + 2.2 * Math.sin((i * 60 + 30) * RAD)]);
  T.prism({ name: "hand.pod.nut", group: pod, layer: hand, F: UP(0, 0), polygon: hex, s0: SOCKET_TOP, s1: SOCKET_TOP + 2, bevel: 0.25, material: "steel" });
  T.round({ name: "hand.pod.cap", group: pod, layer: hand, F: UP(SOCKET[0], SOCKET[1]), s0: SOCKET_TOP + 2, s1: SOCKET_TOP + 2.4, r: 1.3, ends: ["flat", "dome"], material: "chrome" });
  // The break: a somersault along a ballistic arc to the face, then a short slide and yaw.
  const land = [-3, -24];
  const reach = [land[0] - SOCKET[0], land[1] - SOCKET[1]];
  const drop = FACE_Z - SOCKET_TOP;
  const flight = 0.9;
  const apex = 7;
  // rise·t − g t²/2 = drop at t = flight, with rise² / (2 g) = apex.
  const a = (flight * flight) / (4 * apex);
  const rise = (flight + Math.sqrt(flight * flight - 4 * a * drop)) / (2 * a);
  const gravity = (rise * rise) / (2 * apex);
  const heading = unit([reach[0], reach[1], 0]);
  MOTION.pod = { end: 2.2, flight, reach, rise, gravity, drop, axis: [-heading[1], heading[0], 0], slide: [heading[0] * 3.2, heading[1] * 3.2], yaw: 34, decay: 3 };
}
export const BREAK_END = MOTION.pod.end;

// ---------------------------------------------------------------------------
// The reachable states: a dense sweep with taps riding on it, and the break from eight angles.
export function poses() {
  const out = [];
  for (let i = 0; i < 1440; i++) out.push(follow({ dial: i * 0.5, lift: tapAt(i / 60) }));
  for (let j = 0; j < 8; j++) for (let f = 0; f <= Math.round(BREAK_END * 30); f++) {
    const t = f / 30;
    out.push(follow({ dial: j * 45 + 10 * t, lift: tapAt(j * 0.5 + t), pod: breakAt(t) }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Static art. Each item is recorded with a real shape and a layer.
const solid = (paths, style) => k.solidSvg(paths, style);
const put = (item) => {
  for (const shape of item.shapes) R.solid(shape);
  return R.put(item);
};

put({ name: "stand.base", layer: "back", at: [0, 0, BASE_TOP / 2], svg: solid(k.slabOf(BASE, 0, BASE_TOP, P, 8, 1.4), { tone: "lo" }), shapes: [A.slab(BASE, 0, BASE_TOP, { name: "stand.base", ground: true })] });
const POSTS = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [sx > 0 ? PLATE.x + PLATE.w - 9 : PLATE.x + 9, sy > 0 ? PLATE.y + PLATE.d - 9 : PLATE.y + 9]);
const depth = ([x, y]) => x * Math.cos(40 * RAD) + y * Math.sin(40 * RAD);
for (const [index, [x, y]] of POSTS.entries()) {
  const front = depth([x, y]) > 0;
  const name = `stand.post${index}`;
  put({ name, layer: front ? "mid" : "back", at: [x, y, (BASE_TOP + PLATE_Z) / 2], svg: solid(k.cylinder(x, y, 3, BASE_TOP, PLATE_Z - BASE_TOP, P, 28), { tone: "mid" }), shapes: [A.cylinder(x, y, 3, BASE_TOP, PLATE_Z - BASE_TOP, { name })] });
}
put({ name: "stand.axle", layer: "back", at: [WHEEL_C[0], WHEEL_C[1], 7.8], svg: solid(k.cylinder(WHEEL_C[0], WHEEL_C[1], 3, BASE_TOP, LOCK_Z - BASE_TOP, P, 24), { tone: "mid" }), shapes: [A.cylinder(WHEEL_C[0], WHEEL_C[1], 3, BASE_TOP, LOCK_Z - BASE_TOP, { name: "stand.axle" })] });
put({ name: "stand.spindle", layer: "back", at: [0, 0, 7.8], svg: solid(k.cylinder(0, 0, 3, BASE_TOP, LOCK_Z - BASE_TOP, P, 24), { tone: "mid" }), shapes: [A.cylinder(0, 0, 3, BASE_TOP, LOCK_Z - BASE_TOP, { name: "stand.spindle" })] });

// The door plate with a window over the index wheel. The window's far walls show, clipped to the opening.
const WINDOW = (() => {
  const radial = [Math.cos(WHEEL_AT * RAD), Math.sin(WHEEL_AT * RAD)];
  const tangent = [-radial[1], radial[0]];
  const parallax = (PLATE_TOP - LOCK_TOP) / Math.tan(31 * RAD);
  const c = [WHEEL_C[0] + radial[0] * NUMERAL_R + Math.cos(40 * RAD) * parallax * 0.75, WHEEL_C[1] + radial[1] * NUMERAL_R + Math.sin(40 * RAD) * parallax * 0.75];
  const half = [5.4, 7.4];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [c[0] + radial[0] * half[0] * a + tangent[0] * half[1] * b, c[1] + radial[1] * half[0] * a + tangent[1] * half[1] * b]);
})();
{
  const outer = k.roundedPlan(PLATE, 8);
  const paths = k.extrude(outer, PLATE_Z, PLATE_TOP - PLATE_Z, P);
  const ring = (z) => k.pathOf(WINDOW.map(([x, y]) => k.iso([x, y, z], P)), true);
  const hole = ring(PLATE_TOP);
  const sinA = Math.sin(40 * RAD);
  const cosA = Math.cos(40 * RAD);
  const centre = WINDOW.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4], [0, 0]);
  const walls = [];
  const creases = [];
  const seen = [];
  for (let i = 0; i < 4; i++) {
    const a = WINDOW[i];
    const b = WINDOW[(i + 1) % 4];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let n = [-(b[1] - a[1]), b[0] - a[0]];
    const l = Math.hypot(n[0], n[1]);
    n = [n[0] / l, n[1] / l];
    if (n[0] * (centre[0] - mid[0]) + n[1] * (centre[1] - mid[1]) < 0) n = [-n[0], -n[1]];
    const visible = n[0] * cosA + n[1] * sinA > 1e-6;
    seen.push(visible);
    if (!visible) continue;
    const lit = (n[0] * -sinA + n[1] * cosA + 1) / 2;
    const shade = Math.min(3, Math.max(0, Math.floor(lit * 4)));
    const quad = [[a[0], a[1], PLATE_TOP], [b[0], b[1], PLATE_TOP], [b[0], b[1], PLATE_Z], [a[0], a[1], PLATE_Z]].map((p) => k.iso(p, P));
    walls.push(`<path class="iso-shade" data-shade="${shade}" d="${k.pathOf(quad, true)}"/>`);
    creases.push(k.pathOf([k.iso([a[0], a[1], PLATE_Z], P), k.iso([b[0], b[1], PLATE_Z], P)]));
  }
  for (let i = 0; i < 4; i++) if (seen[i] && seen[(i + 3) % 4]) creases.push(k.pathOf([k.iso([WINDOW[i][0], WINDOW[i][1], PLATE_TOP], P), k.iso([WINDOW[i][0], WINDOW[i][1], PLATE_Z], P)]));
  const clip = `<clipPath id="td-window"><path d="${hole}"/></clipPath>`;
  const shades = paths.shades.map((d, shade) => (d ? `<path class="iso-shade" data-shade="${shade}" d="${d}"/>` : "")).join("");
  const svg = `<g class="iso-solid">${`<defs>${clip}</defs>`}<path class="iso-fill" fill-rule="evenodd" d="${paths.fill}${hole}"/>${shades}<path class="iso-top" fill-rule="evenodd" d="${paths.top}${hole}"/><g clip-path="url(#td-window)">${walls.join("")}<path class="iso-line iso-crease" data-tone="faint" d="${creases.join("")}"/></g>${paths.crease ? `<path class="iso-line iso-crease" data-tone="faint" d="${paths.crease}"/>` : ""}<path class="iso-line iso-edge" data-tone="hi" d="${paths.outline}"/><path class="iso-line iso-edge" data-tone="mid" d="${hole}"/></g>`;
  put({ name: "stand.plate", layer: "mid", at: [0, 0, PLATE_Z], svg, shapes: [A.slab(PLATE, PLATE_Z, PLATE_TOP - PLATE_Z, { name: "stand.plate" })] });
}
put({ name: "stand.washer", layer: "mid", at: [0, 0, PLATE_TOP + 0.7], svg: solid(k.cylinder(0, 0, 12, PLATE_TOP, DIAL_Z - PLATE_TOP, P, 48), { tone: "mid" }), shapes: [A.cylinder(0, 0, 12, PLATE_TOP, DIAL_Z - PLATE_TOP, { name: "stand.washer" })] });
{
  const dir = [Math.cos(INDEX_AT * RAD), Math.sin(INDEX_AT * RAD)];
  const side = [-dir[1], dir[0]];
  const p = (r, w) => [dir[0] * r + side[0] * w, dir[1] * r + side[1] * w];
  const ring = [p(DIAL_R - 0.6, 0), p(DIAL_R + 7, -3.2), p(DIAL_R + 7.6, 0), p(DIAL_R + 7, 3.2)];
  const h = 1.2;
  put({ name: "stand.index", layer: "mid", at: [...p(DIAL_R + 4, 0), PLATE_TOP + h / 2], svg: `<g data-mat="brass">${solid(k.extrude(ring, PLATE_TOP, h, P), { tone: "hi", lit: true })}</g>`, shapes: [A.extruded(ring, PLATE_TOP, h, { name: "stand.index" })] });
}
put({ name: "stand.pawl.post", layer: "mid", at: [PAWL_PIVOT[0], PAWL_PIVOT[1], PLATE_TOP + 1.5], svg: `<g data-mat="steel">${solid(k.cylinder(PAWL_PIVOT[0], PAWL_PIVOT[1], 1.5, PLATE_TOP, PAWL_Z - PLATE_TOP, P, 24), { tone: "hi" })}</g>`, shapes: [A.cylinder(PAWL_PIVOT[0], PAWL_PIVOT[1], 1.5, PLATE_TOP, PAWL_Z - PLATE_TOP, { name: "stand.pawl.post" })] });

// ---------------------------------------------------------------------------
// Build.
export const out = T.build({ statics: R.items, poses, verify: VERIFY });
A.settle(R, P);

function layerMarkup(name) {
  return R.items
    .filter((item) => item.layer === name)
    .sort((a, b) => a.key - b.key)
    .map((item) => item.svg)
    .join("");
}

// Route × part pairs the crowding line may skip, each looked at in a 4x shot: the red and blue
// cables end on junction blocks that sit on the outer fingers' links, and the blue one runs
// beside the thumb and the piston, so at a few angles a cable's end meets one of those slender
// outlines on screen while the two stay separate parts in depth.
const CROWD = [
  ["cable.red", "hand.f1.p*"],
  ["cable.blue", "hand.f3.p*"],
  ["cable.blue", "hand.thumb.p*"],
  ["cable.blue", "hand.piston.*"],
];

if (MAIN) main();

function main() {
  if (has("--audit")) {
    A.auditOrExit(R, P);
    const only = FLAGS.find((flag) => flag.startsWith("--only="));
    TA.orbitOrExit(T, R, P, {
      sweep: { at: (x) => follow({ dial: x }), from: 0, to: 1440, frame: 0.3 },
      clips: [
        { name: "tap", at: (t) => follow({ dial: 30 + 6 * t, lift: tapAt(t) }), from: 0, to: MOTION.tap.period, frame: 1 / 60 },
        { name: "break", at: (t) => follow({ dial: 60 + 10 * t, lift: 0.4, pod: breakAt(t) }), from: 0, to: BREAK_END, frame: 1 / 60 },
      ],
      crowd: CROWD,
      quick: has("--quick"),
      only: only ? only.slice(7).split(",").filter(Boolean) : null,
      log: has("--verbose") ? (text) => console.log(`  … ${text}`) : null,
    });
  }
  const file = `turning-dial${VERIFY ? "-verify" : ""}${LIGHT ? "-light" : ""}.html`;
  const html = page();
  writeFileSync(join(HERE, file), html);
  const layers = out.report.layers.map((layer) => `${layer.name}: ${layer.planar} planes, ${layer.dynamic} dynamic`).join(" · ");
  console.log(`wrote ${file} · ${Math.round(Buffer.byteLength(html) / 1024)} KB · ${out.report.parts} parts · ${layers} · build ${out.report.seconds.toFixed(1)} s`);
}

// ---------------------------------------------------------------------------
// The page.
function reading(theta) {
  return Math.round((((INDEX_AT + 90 - theta) / 3.6) % 100 + 100) % 100) % 100;
}

function page() {
  const label = "A combination dial on a raised door plate, read against a brass index. A small robot hand rests on the hub and turns with the dial; under the plate a pinion drives an index wheel seen through a window, and a pawl rides the knurled skirt.";
  const back = k.figureSvg({ width: W, height: H, label, body: layerMarkup("back") });
  const layerOf = (name) => `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg iso-layer" viewBox="0 0 ${W} ${H}" aria-hidden="true">${layerMarkup(name)}</svg>`;
  const canvas = (where) => `<canvas class="iso-layer td-gl" data-canvas="${where}" aria-hidden="true"></canvas>`;
  const start = reading(0);
  const stage = `<div class="iso-stage iso-turn td-stage" tabindex="0" role="slider" aria-label="Turning dial. Drag the dial or use the arrow keys to turn it one division at a time (Shift for ten); Home returns to zero; B breaks the pod off the hand and puts it back." aria-valuemin="0" aria-valuemax="99" aria-valuenow="${start}" aria-valuetext="dial at ${start}">${back}${out.layerSvg("lock", { width: W, height: H })}${layerOf("mid")}${out.layerSvg("dial", { width: W, height: H })}${canvas("back")}${out.layerSvg("hand", { width: W, height: H })}${canvas("front")}${layerOf("front")}</div>`;
  const css = `${out.css}\n${readFileSync(join(HERE, "dial.css"), "utf8")}`;
  const body = k.plateHtml({
    fig: "Fig 3D",
    title: "Turning dial",
    hint: "Drag the dial · arrow keys · B breaks the pod",
    readout: `dial ${start} · 0.0°`,
    keys: [
      { mark: "raised", label: "Dial and hand: one rigid group that turns together" },
      { mark: "lit", label: "The index" },
    ],
    caption: "The kit's optional 3D mode. Each frame, every part on the dial is projected and shaded again by the same rules the kit uses for still drawings, and painted in an order worked out from planes that separate each pair of parts.",
    body: `<style>${css}</style>${stage}`,
  });
  const DATA = {
    turn: out.data,
    index: INDEX_AT * RAD,
    pod: { rest: POD_AT, end: BREAK_END },
    gl: {
      view: [W, H],
      camera: glCamera(P),
      led: { point: LED.point, dir: LED.dir, part: LED.part, group: LED.group },
      face: { z: FACE_Z, r: FACE_R, hub: HUB_R },
      socket: [SOCKET[0], SOCKET[1], SOCKET_TOP],
      socketPart: "hand.pod.socket",
    },
  };
  const live = readFileSync(join(HERE, "live.js"), "utf8")
    .replace("__DATA__", () => JSON.stringify(DATA))
    .replace("__MOTION__", () => JSON.stringify(MOTION))
    .replace("__FUNCTIONS__", () => [follow, tapAt, breakAt].map((fn) => fn.toString()).join("\n"));
  const hook = VERIFY ? `window.__isoVerify = ${JSON.stringify(out.verify)};\n` : "";
  return k.pageHtml({ title: "Turning dial", theme: LIGHT ? "light" : "dark", width: 680, body, script: turnScript() + glScript() + hook + live });
}
