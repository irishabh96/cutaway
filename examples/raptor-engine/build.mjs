// Raptor 2 hung nozzle-down in a vertical test stand.
// Every part is modelled in world units (about 1 cm), recorded for kit/audit.mjs as it is drawn,
// and emitted as depth-sorted groups that the live script moves apart and fires.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import * as G from "../../kit/lathe.mjs";
import { tubePieces, tubeSvg, crossingsOf } from "../../kit/tube.mjs";
import * as A from "../../kit/audit.mjs";
import { glCamera } from "../../kit/gl.mjs";
import { glScript } from "../../scripts/inline-kit.mjs";
import { pdfButton } from "../../kit/pdf-button.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const THEME = process.argv.includes("--light") ? "light" : "dark";

// ---------------------------------------------------------------- facts
const FACT = { thrustTf: 230, chamberBar: 300, mixture: 3.6, dryKg: 1630, exitM: 1.3, loxC: -183, ch4C: -162 };
const G0 = 9.80665;
const BACK_TF = (101325 * Math.PI * (FACT.exitM / 2) ** 2) / G0 / 1000;

// ---------------------------------------------------------------- motion (one source for page and audit)
const SPRING = { stagger: 0.035, stiffness: 64, damping: 14.2, substeps: 4 };
const STAGGER = ["nozzle", "downcomer", "controller", "plumbing", "lox", "ftp", "hotgas", "chamber", "orpb", "otp", "gimbal", "stand"];
const rad = (deg) => (deg * Math.PI) / 180;
const radial = (deg, r = 1, z = 0) => [r * Math.cos(rad(deg)), r * Math.sin(rad(deg)), z];

// ---------------------------------------------------------------- layout
const W = 900;
const H = 1000;
const Z0 = 180; // nozzle exit plane above the deck
const DECK = { x: -190, y: -190, w: 380, d: 380, r: 18 };
const DECK_T = 12;
const FOOT_H = 8;
const COL = 165; // columns stand at (COL, -COL) and (-COL, COL)
const COL_HALF = 12;
const BEAM_Z = [520, 542];
const BEAM_HALF = 11;
const BEAM_LEN = 256;
const FTP_DEG = 340;
const FTP_R = 92;
const FTP_C = radial(FTP_DEG, FTP_R);
const OUT_TO_FTP = G.unit3([FTP_C[0], FTP_C[1], 0]);

const P = k.fitProjection(
  [
    ...k.boxCorners(DECK, -DECK_T - FOOT_H, 0),
    [COL + COL_HALF, -COL - COL_HALF, BEAM_Z[1]],
    [-COL - COL_HALF, COL + COL_HALF, BEAM_Z[1]],
    [COL + COL_HALF, -COL + COL_HALF, BEAM_Z[1]],
    [-COL + COL_HALF, COL + COL_HALF, BEAM_Z[1]],
  ],
  W,
  H,
  { pad: 30, azimuth: 45, elevation: 28 },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const Faded = (list, style) => k.fadedSvg(list, style);
const path3 = (points, closed = false) => k.pathOf(points.map(at), closed);
const BOLT_FADE = [0.04, 0.42];
const RIB_FADE = [0.1, 0.55];
const UP = [0, 0, 1];

// The direction across the screen from a leg along d: a bend in the plane of d and this faces the viewer.
const sideOn = (d) => G.unit3(G.cross3(G.unit3(G.sub3(V, G.mul3(d, G.dot3(V, d)))), d));

// ---------------------------------------------------------------- assemblies
const ASSEMBLIES = [
  { id: "gimbal", name: "Gimbal and thrust puck", move: [0, 0, 0] },
  { id: "otp", name: "Oxygen turbopump", move: [0, 0, -16] },
  { id: "orpb", name: "Oxygen-rich preburner", move: [0, 0, -40] },
  { id: "lox", name: "Oxygen duct and main valve", move: null },
  { id: "controller", name: "Engine controller and harness", move: radial(58, 80) },
  { id: "chamber", name: "Injector and main chamber", move: [0, 0, -66] },
  { id: "hotgas", name: "Hot-gas manifold", move: G.add3(G.mul3(OUT_TO_FTP, 46), [0, 0, -30]) },
  { id: "ftp", name: "Methane turbopump and fuel-rich preburner", move: G.add3(G.mul3(OUT_TO_FTP, 86), [0, 0, -30]) },
  { id: "downcomer", name: "Downcomer and main fuel valve", move: null },
  { id: "plumbing", name: "Plumbing", move: radial(232, 54) },
  { id: "nozzle", name: "Nozzle", move: [0, 0, -120] },
];
const MOVE = Object.fromEntries(ASSEMBLIES.map((a) => [a.id, a.move]));
MOVE.stand = [0, 0, 0];

const R = A.recorder(P, { order: STAGGER, spring: SPRING });
const HOST = {};
const record = R.solid;

function put(piece, ref, svg, shapes, { bias = 0, ride, name, ...rest } = {}) {
  const mover = ride ?? piece;
  if (!MOVE[mover]) throw new Error(`no move for ${mover}`);
  return R.put({ piece, ride: mover, move: MOVE[mover], at: ref, bias, svg, shapes, name: name ?? shapes[0]?.name ?? R.nameFor(`${piece}.item`), ...rest });
}

// ---------------------------------------------------------------- turned parts
const centreOf = (F, s) => G.add3(F.o, G.mul3(F.a, s));

function turned(piece, name, F, profile, style = {}, { extra = "", inner = "", bias = 0, smooth, ride, owner, seated, cut, more = [], fitting, anchor } = {}) {
  const options = smooth === undefined ? { smooth: false } : { smooth };
  const paths = G.solidOf(profile, F, P, options);
  const meta = { name, owner, seated, cut, fitting, anchor };
  for (const key of Object.keys(meta)) if (meta[key] === undefined) delete meta[key];
  const shape = record(A.solid(F, profile, { ...meta, radius: smooth && smooth.radius ? smooth.radius : null }));
  const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
  put(piece, centreOf(F, mid), S(paths, { tone: "mid", ...style, inner }) + extra, [shape, ...more], { bias, ride });
  return shape;
}

const disc = (piece, name, F, s0, s1, r, style, options) => turned(piece, name, F, [[s0, r], [s1, r]], style, options);

function ball(piece, name, c, r, style = {}, { bias = 0, ride, owner, extra = "" } = {}) {
  const shape = record(A.ball(c, r, owner ? { name, owner } : { name }));
  put(piece, c, S(G.sphereOf(c, r, P, { steps: 40 }), { tone: "mid", ...style }) + extra, [shape], { bias, ride });
  return shape;
}

function prism(piece, name, F, poly, s0, s1, style = {}, { extra = "", inner = "", bias = 0, ride, owner } = {}) {
  const shape = record(A.prism(F, poly, s0, s1, owner ? { name, owner } : { name }));
  const cx = poly.reduce((sum, p) => sum + p[0], 0) / poly.length;
  const cy = poly.reduce((sum, p) => sum + p[1], 0) / poly.length;
  const ref = G.add3(G.add3(centreOf(F, (s0 + s1) / 2), G.mul3(F.u, cx)), G.mul3(F.v, cy));
  put(piece, ref, S(G.prismOf(F, poly, s0, s1, P), { tone: "mid", ...style, inner }) + extra, [shape], { bias, ride });
  return shape;
}
const rect = (u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];

// A pad whose base follows a curved host: the start of each generator is found on the host's own shape.
function saddleStart(host, F, a, from, to) {
  return (angle) => {
    let lo = from;
    let hi = to;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (A.sdf(host, G.pointOf(F, mid, a, angle)) < 0) lo = mid;
      else hi = mid;
    }
    return hi;
  };
}
function pad(piece, name, host, F, a, s1, style = {}, { extra = "", bias = 0, ride, from = -12, owner } = {}) {
  const start = saddleStart(host, F, a, from, s1);
  const low = Math.min(...Array.from({ length: 24 }, (_, j) => start((j / 24) * Math.PI * 2)));
  const shape = record(A.disc(F, low - 0.6, s1, a, owner ? { name, owner, seated: true, cut: host } : { name, seated: true, cut: host }));
  put(piece, centreOf(F, (low + s1) / 2), S(G.saddleOf(F, a, start, s1, P), { tone: "mid", ...style }) + extra, [shape], { bias, ride });
  return shape;
}

const bolts = (F, s, r, count, { phase = 0, all = false, size = 0.5, tone = "mid", slope = 0 } = {}) =>
  Dots(G.dotsOf(F, s, r, count, P, all ? { phase, all: true } : { phase, fade: BOLT_FADE, slope }), { size, tone });
const faceRing = (F, s, r, tone = "faint") => Ln(G.circleOf(F, s, r, P), { tone });
const facesViewer = (axis) => G.dot3(axis, V) > 0.12;

// ---------------------------------------------------------------- pipes and cables
const LINES = { cables: [], sense: [], small: [] };

function collarAt(route, at, half) {
  const total = G.pathLength(route);
  const mid = Math.max(half, Math.min(total - half, at));
  return { F: G.frameAlong(G.pointAlong(route, mid), G.tangentAlong(route, mid)), from: mid - half, to: mid + half };
}

function pipe(piece, name, points, r, opts = {}) {
  const {
    tone = "hi", bend = Math.max(3, r * 2.6), flanges = [true, true], flangeR = r + 2.2, flangeT = Math.max(1.4, r * 0.45), couplings = [false, false],
    bands = [], bellows = null, valve = null, maxLength = 14, free = [false, false], breaks = [], ride, perArc = 8, ends = [true, true], bias = 0.05, stripes, elbows = [],
  } = opts;
  const mover = ride ?? piece;
  // corners listed in elbows turn inside a ball fitting instead of a fillet
  let route = [];
  let from = 0;
  const corners = [];
  for (let i = 1; i < points.length; i++) {
    if (!elbows.includes(i) && i < points.length - 1) continue;
    const part = G.fillet(points.slice(from, i + 1), bend, perArc, { P, tube: r });
    route = route.length ? [...route, ...part.slice(1)] : part;
    if (elbows.includes(i)) corners.push({ at: G.pathLength(route), c: points[i] });
    from = i;
  }
  const total = G.pathLength(route);
  const collars = [];
  const elbowR = r + 1.6;
  for (const corner of corners) collars.push({ kind: "elbow", from: corner.at - Math.sqrt(elbowR ** 2 - r * r), to: corner.at + Math.sqrt(elbowR ** 2 - r * r), c: corner.c, r: elbowR });
  const flangeOf = (side) => (Array.isArray(flangeR) ? flangeR[side] : flangeR);
  [0, 1].forEach((side) => {
    if (couplings[side]) {
      const length = r * 3.2;
      const c = collarAt(route, side ? total - length / 2 : length / 2, length / 2);
      collars.push({ kind: "coupling", side, ...c, r: r + 1.3 });
    } else if (flanges[side]) {
      const c = collarAt(route, side ? total - flangeT / 2 : flangeT / 2, flangeT / 2);
      collars.push({ kind: "flange", side, ...c, r: flangeOf(side) });
    }
  });
  const along = (at) => (typeof at === "number" ? at * total : at.s < 0 ? total + at.s : at.s);
  for (const at of bands) collars.push({ kind: "band", ...collarAt(route, along(at), 0.9), r: r + 0.9 });
  if (bellows) collars.push({ kind: "bellows", ...collarAt(route, (along(bellows[0]) + along(bellows[1])) / 2, (along(bellows[1]) - along(bellows[0])) / 2), r: r + 1.5, count: bellows[2] ?? 6 });
  if (valve) collars.push({ kind: "valve", ...collarAt(route, along(valve.at), valve.length / 2), r: r + 4.2, valve });
  const gaps = collars.map((c) => [c.from, c.to]);
  const rims = [0, 1].map((side) => collars.find((c) => c.side === side)?.r ?? r);
  R.route(name, route, r, { piece, ride: mover, move: MOVE[mover], gaps, rims, free, ends, touch: corners.length ? [`${name}.elbow`] : undefined });
  tubePieces(route, r, P, { maxLength, gaps, breaks, ...(stripes === undefined ? {} : { stripes }) }).forEach((chunk, index) =>
    put(piece, chunk.mid, tubeSvg(chunk, { tone }), [A.tube(chunk.points, chunk.radii, { name, owner: name })], { bias, ride: mover, name: `${name}:${index}`, route: name, chunk: index }),
  );
  for (const c of collars) drawCollar(piece, name, c, r, mover, opts);
  return { route, total, collars };
}

function drawCollar(piece, name, c, r, mover, { valveTone = "hi", tone = "hi" } = {}) {
  const half = (c.to - c.from) / 2;
  const F = c.F;
  const options = { owner: name, ride: mover, bias: 0.1 };
  if (c.kind === "elbow") {
    ball(piece, `${name}.elbow`, c.c, c.r, { tone: tone === "hi" ? "hi" : "mid" }, { ride: mover, owner: `${name}.elbow`, bias: 0.1 });
  } else if (c.kind === "flange") {
    const face = G.dot3(F.a, V) > 0 ? half : -half;
    const extra = Math.abs(G.dot3(F.a, V)) > 0.12 ? bolts(F, face, c.r * 0.74, 8, { all: true, size: 0.42 }) : "";
    disc(piece, `${name}.flange${c.side}`, F, -half, half, c.r, { tone: "mid" }, { ...options, extra });
  } else if (c.kind === "coupling") {
    const hex = 6;
    const profile = [[-half, c.r - 0.5], [-half + 0.6, c.r], [half - 0.6, c.r], [half, c.r - 0.5]];
    turned(piece, `${name}.coupling${c.side}`, F, profile, { tone: "mid" }, { ...options, extra: Faded(G.ribsOf(F, -half + 0.6, half - 0.6, c.r, hex * 3, P, { fade: RIB_FADE }), { tone: "lo" }) });
  } else if (c.kind === "band") {
    disc(piece, `${name}.band`, F, -half, half, c.r, { tone: "mid" }, options);
  } else if (c.kind === "bellows") {
    const n = c.count;
    const profile = [];
    for (let i = 0; i <= n * 2; i++) profile.push([-half + (2 * half * i) / (n * 2), i % 2 ? c.r : c.r - 1.1]);
    turned(piece, `${name}.bellows`, F, profile, { tone: "mid" }, options);
  } else if (c.kind === "valve") {
    const { valve } = c;
    const rf = r + 2.4;
    const t = 1.4;
    const h = half - t;
    const bulge = (s) => r + 1.2 + (c.r - r - 1.2) * Math.sqrt(Math.max(0, 1 - (s / h) ** 2));
    const bulgeSlope = (s) => {
      const q = Math.max(1e-4, 1 - (s / h) ** 2);
      return (-(c.r - r - 1.2) * (s / (h * h))) / Math.sqrt(q);
    };
    const knots = Array.from({ length: 25 }, (_, i) => {
      const s = -h * 0.999 + ((2 * h * 0.999) * i) / 24;
      return [s, bulge(s)];
    });
    const faceOf = (end) => (G.dot3(F.a, V) * end > 0.12 ? bolts(F, end * half, rf * 0.76, 8, { all: true, size: 0.4 }) : "");
    disc(piece, `${name}.valve.flange0`, F, -half, -h, rf, { tone: "mid" }, { ...options, extra: faceOf(-1) });
    turned(piece, `${name}.valve`, F, knots, { tone: valveTone }, { ...options, smooth: { slope: (s) => bulgeSlope(Math.max(-h * 0.999, Math.min(h * 0.999, s))), radius: (s) => bulge(Math.max(-h * 0.999, Math.min(h * 0.999, s))) } });
    disc(piece, `${name}.valve.flange1`, F, h, half, rf, { tone: "mid" }, { ...options, extra: faceOf(1) });
    // neck and actuator stand off the body, perpendicular to the pipe
    const out = G.unit3(G.sub3(valve.side, G.mul3(F.a, G.dot3(valve.side, F.a))));
    const base = F.o;
    const NF = G.frameAlong(base, out);
    const neckFrom = c.r - 0.6;
    disc(piece, `${name}.valve.neck`, NF, neckFrom, c.r + 2.2, 2.2, { tone: "mid" }, options);
    const AF = G.frameAlong(base, out);
    const can = valve.can ?? 4.2;
    const lid = c.r + 2.2 + (valve.reach ?? 9);
    const extra = facesViewer(out) ? faceRing(AF, lid, can * 0.62) + bolts(AF, lid, can * 0.62, 2, { all: true, size: 0.45, phase: 0.6 }) : "";
    turned(piece, `${name}.valve.actuator`, AF, [[c.r + 2.2, can], [lid - 0.8, can], [lid, can - 0.8]], { tone: "mid" }, { ...options, extra, inner: Ln(G.arcOf(AF, c.r + 4.2, can, P), { tone: "faint" }) });
    c.lid = G.add3(base, G.mul3(out, lid));
    c.lidAxis = out;
  }
}

function cable(piece, name, points, r = 0.6, { tone = "mid", bend = 3, ends = [true, true], shells = [false, false], free, clamps = [], maxLength = 10, bias = 0.08, ride, bundle, list = LINES.cables, perArc = 9, touch } = {}) {
  const mover = ride ?? piece;
  const route = G.fillet(points, Math.max(bend, r * 2.6), perArc, { P, tube: r });
  const total = G.pathLength(route);
  const SHELL = Math.max(2, r * 3);
  const gaps = [...(shells[0] ? [[0, SHELL]] : []), ...(shells[1] ? [[total - SHELL, total]] : [])];
  for (const clamp of clamps) for (const hit of crossingsOf(route, clamp.c, clamp.axis, clamp.r + 1)) gaps.push([hit - 0.95, hit + 0.95]);
  const rims = shells.map((on) => (on ? r * 1.9 : r));
  R.route(name, route, r, { piece, ride: mover, move: MOVE[mover], gaps, limp: true, rims, free: free ?? shells, bundle, touch });
  if (list) list.push(name);
  tubePieces(route, r, P, { maxLength, spacing: Math.max(0.6, Math.min(1.6, r)), gaps }).forEach((chunk, index) =>
    put(piece, chunk.mid, tubeSvg(chunk, { tone }), [A.tube(chunk.points, chunk.radii, { name, owner: name })], { bias, ride: mover, name: `${name}:${index}`, route: name, chunk: index }),
  );
  [0, 1].forEach((index) => {
    const end = index ? route[route.length - 1] : route[0];
    if (shells[index]) {
      const tangent = G.tangentAlong(route, index ? total : 0);
      const F = G.frameAlong(end, tangent);
      const [s0, s1] = index ? [-SHELL, 0] : [0, SHELL];
      disc(piece, `${name}.shell${index}`, F, s0, s1, r * 1.9, { tone: "mid" }, { owner: name, ride: mover, bias: bias + 0.1 });
    } else if (ends[index]) {
      const size = Math.max(0.55, r * KS * 0.95);
      const inward = G.mul3(G.tangentAlong(route, index ? total : 0), index ? -1 : 1);
      const c = G.add3(end, G.mul3(inward, Math.max(0, size / KS - 0.4)));
      const shape = record(A.ball(c, size / KS, { name: `${name}.end${index}`, owner: name }));
      put(piece, c, Dots([at(c)], { size, tone: "hi" }), [shape], { bias: bias + 0.15, ride: mover });
    }
  });
  return { route, total };
}

// ================================================================= the stand (back layer, static)
const back = [];
const STAND = "stand.frame";
const fixed = (shape) => record({ ...shape, owner: STAND });
back.push(`<path class="iso-halo" d="${k.haloOf(DECK, -DECK_T - FOOT_H, DECK_T, P)}"/>`);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const FEET = [...k.corners(DECK, 26), [0, DECK.y + 26], [0, DECK.y + DECK.d - 26]].concat([[DECK.x + 26, 0], [DECK.x + DECK.w - 26, 0]]);
for (const [x, y] of byDepth(FEET)) {
  back.push(S(k.cylinder(x, y, 9, -DECK_T - FOOT_H, 2, P, 32), { tone: "lo" }));
  back.push(S(k.cylinder(x, y, 6.5, -DECK_T - FOOT_H + 2, FOOT_H - 2, P, 32), { tone: "mid" }));
  fixed(A.cylinder(x, y, 9, -DECK_T - FOOT_H, FOOT_H, { name: "stand.foot" }));
}
fixed(A.slab(DECK, -DECK_T, DECK_T, { name: "stand.deck" }, 8));
back.push(S(k.slabOf(DECK, -DECK_T, DECK_T, P, 8, 1.4), { tone: "mid", inner: Ln(k.sideSeam(DECK, -4, P, 8), { tone: "faint" }) }));
{
  const front = k.sideTicks(DECK.x + 30, DECK.x + DECK.w - 30, 10, 5, DECK.y + DECK.d, 0, [2, 4.5], P, "x");
  const right = k.sideTicks(DECK.y + 30, DECK.y + DECK.d - 30, 10, 5, DECK.x + DECK.w, 0, [2, 4.5], P, "y");
  back.push(Ln(front.minor + right.minor, { tone: "lo" }), Ln(front.major + right.major, { tone: "mid" }));
}
back.push(Ln(k.planOutline(k.insetPlan(DECK, 7), 0, P), { tone: "lo" }));
{
  // grating: closed slots on four panels round the flame pit, so no line ends on bare deck
  const slots = [];
  const panel = (x0, y0, w, d, along) => {
    slots.push(k.planOutline({ x: x0, y: y0, w, d, r: 2 }, 0, P, 3));
    const n = Math.floor((along === "x" ? d : w) / 7);
    for (let i = 0; i < n - 1; i++) {
      if (along === "x") slots.push(k.planOutline({ x: x0 + 3, y: y0 + 4 + i * 7, w: w - 6, d: 2.4, r: 1.2 }, 0, P, 3));
      else slots.push(k.planOutline({ x: x0 + 4 + i * 7, y: y0 + 3, w: 2.4, d: d - 6, r: 1.2 }, 0, P, 3));
    }
  };
  panel(108, -150, 52, 128, "x");
  panel(-160, 98, 128, 52, "y");
  panel(-160, -160, 60, 60, "x");
  back.push(Ln(slots.join(""), { tone: "faint" }));
}
{
  const STRIP = { x: DECK.x + DECK.w - 20, y: -96, w: 8, d: 192, r: 1 };
  back.push(S(k.slabOf(STRIP, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(STRIP.y + 4, STRIP.y + STRIP.d - 4, 4, 5, STRIP.x, 0.6, [2.4, 4.6], P, "y");
  back.push(Ln(ticks.minor, { tone: "lo" }), Ln(ticks.major, { tone: "mid" }));
  const LABEL = { x: 96, y: 128, w: 56, d: 22, r: 1.6 };
  back.push(S(k.slabOf(LABEL, 0, 0.8, P, 3), { tone: "lo", crease: "none" }));
  back.push(Ln(k.planOutline(k.insetPlan(LABEL, 1.6), 0.8, P, 3), { tone: "faint" }));
  back.push(k.faceTextSvg(k.topMatrix([LABEL.x + 5, LABEL.y + 9.5], 0.8, P, "x"), "RAPTOR 2", { size: 6, tone: "mid" }));
  back.push(Ln([30, 22].map((w, i) => k.lineOnTop([LABEL.x + 5, LABEL.y + 14 + i * 3.4], [LABEL.x + 5 + w, LABEL.y + 14 + i * 3.4], 0.8, P)).join(""), { tone: "lo", free: true }));
  back.push(Dots([at([LABEL.x + LABEL.w - 3, LABEL.y + 3, 0.8]), at([LABEL.x + LABEL.w - 3, LABEL.y + LABEL.d - 3, 0.8])], { size: 0.5 }));
  const screws = k.corners(DECK, 13);
  back.push(Ln(screws.map(([x, y]) => k.ring(x, y, 2.6, 0, P, 18)).join(""), { tone: "lo" }), Dots(screws.map(([x, y]) => at([x, y, 0])), { size: 0.55 }));
}
// the glow the burn throws on the deck (CSS colours its four stops; the sheet strips it)
{
  const glowR = 170;
  const c = at([0, 0, 0]);
  const ex = G.sub3(at([glowR, 0, 0]), c);
  const ey = G.sub3(at([0, glowR, 0]), c);
  const deckTop = k.planOutline(k.insetPlan(DECK, 2), 0.05, P);
  back.push(`<defs><radialGradient id="rp-deck-glow" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="matrix(${ex[0].toFixed(3)} ${ex[1].toFixed(3)} ${ey[0].toFixed(3)} ${ey[1].toFixed(3)} ${c[0].toFixed(2)} ${c[1].toFixed(2)})"><stop class="rp-stop-0" offset="0"/><stop class="rp-stop-1" offset="0.3"/><stop class="rp-stop-2" offset="0.62"/><stop class="rp-stop-3" offset="1"/></radialGradient></defs><path class="rp-deckglow" d="${deckTop}" fill="url(#rp-deck-glow)"/>`);
}

// flame cone on its plate, with the deluge ring round it
const CONE = { plate: 62, plateH: 3, r: 48, h: 46 };
const coneZ0 = CONE.plateH;
const coneR = (z) => CONE.r * Math.pow(Math.max(0, 1 - (z - coneZ0) / CONE.h), 0.8);
const coneSlope = (z) => {
  const x = Math.min(0.9995, Math.max(0, (z - coneZ0) / CONE.h));
  return (-CONE.r * 0.8 * Math.pow(1 - x, -0.2)) / CONE.h;
};
const DELUGE = { R: 86, r: 3.4, lift: 1.8 };
const deluge = [];
{
  const FLOOR = G.frameOf([0, 0, 0], UP, [1, 0, 0], [0, 1, 0]);
  fixed(A.disc(FLOOR, 0, CONE.plateH, CONE.plate, { name: "stand.coneplate" }));
  const coneProfile = Array.from({ length: 30 }, (_, i) => {
    const z = coneZ0 + (CONE.h * i) / 29;
    return i === 29 ? [z, 0] : i === 0 ? [z, coneR(z)] : [z, coneR(z), 1];
  });
  fixed(A.solid(FLOOR, coneProfile, { name: "stand.cone", radius: (z) => coneR(z) }));
  const plateSvg = S(G.disc(0, CONE.plateH, CONE.plate, FLOOR, P), { tone: "lo" }) + bolts(FLOOR, CONE.plateH, CONE.plate - 5, 24, { all: true, size: 0.5 });
  const coneSvg = S(G.solidOf(coneProfile, FLOOR, P, { smooth: { slope: coneSlope, radius: (z) => coneR(Math.min(z, coneZ0 + CONE.h)) } }), { tone: "mid" });
  // deluge ring, tee and feed to a valve box at the deck edge
  const ringZ = DELUGE.r + DELUGE.lift;
  const ringF = G.frameOf([0, 0, ringZ], UP, [1, 0, 0], [0, 1, 0]);
  const TEE_DEG = 30;
  const ringPoints = G.arcPoints(ringF, 0, DELUGE.R, rad(TEE_DEG), rad(TEE_DEG) + Math.PI * 2, 96);
  const ringTotal = G.pathLength(ringPoints);
  const teeR = 4.6;
  const teeCut = Math.sqrt(teeR * teeR - DELUGE.r * DELUGE.r);
  const ringGaps = [[0, teeCut], [ringTotal - teeCut, ringTotal]];
  R.route("stand.deluge", ringPoints, DELUGE.r, { owner: "stand.deluge", gaps: ringGaps, ends: [false, false], touch: ["stand.deluge.chock"] });
  const teeC = radial(TEE_DEG, DELUGE.R, ringZ);
  record(A.ball(teeC, teeR, { name: "stand.deluge.tee", owner: "stand.deluge" }));
  const BOX = { x: 142, y: 66, w: 26, d: 18, r: 2 };
  const feedStart = G.add3(teeC, G.mul3(radial(TEE_DEG), Math.sqrt(teeR * teeR - 2.6 * 2.6)));
  const feedEnd = [BOX.x, BOX.y + BOX.d / 2, ringZ];
  const feed = G.fillet([feedStart, G.add3(feedStart, G.mul3(radial(TEE_DEG), 12)), [feedStart[0] + 12 * Math.cos(rad(TEE_DEG)) + 8, feedEnd[1], ringZ], feedEnd], 8, 8);
  R.route("stand.deluge.feed", feed, 2.6, { owner: "stand.deluge", ends: [false, true], touch: ["stand.deluge.chock"] });
  fixed(A.slab(BOX, 0, 16, { name: "stand.deluge.box" }, 3));
  const waterDots = Dots(G.dotsOf(ringF, DELUGE.r, DELUGE.R, 72, P, { all: true }).map(([x, y]) => [x, y]), { size: 0.45, tone: "lo" });
  const chocks = [];
  for (const deg of [0, 60, 120, 180, 240, 300].map((d) => d + TEE_DEG + 30)) {
    const [x, y] = radial(deg, DELUGE.R);
    record(A.cylinder(x, y, 2.4, 0, DELUGE.lift, { name: "stand.deluge.chock", owner: "stand.deluge" }));
    chocks.push({ key: G.dot3([x, y, 0], V) - 0.5, svg: S(k.cylinder(x, y, 2.4, 0, DELUGE.lift, P, 20), { tone: "lo" }) });
  }
  const ringChunks = tubePieces(ringPoints, DELUGE.r, P, { maxLength: 14, gaps: ringGaps });
  const feedChunks = tubePieces(feed, 2.6, P, { maxLength: 400, caps: [false, true] });
  const items = [];
  items.push({ key: k.depthOf([0, 0, 0], P) - 1000, svg: plateSvg }, ...chocks);
  for (const chunk of ringChunks) items.push({ key: G.dot3(chunk.mid, V), svg: tubeSvg(chunk, { tone: "mid" }) });
  items.push({ key: G.dot3(teeC, V), svg: S(G.sphereOf(teeC, teeR, P), { tone: "mid" }) });
  for (const chunk of feedChunks) items.push({ key: G.dot3(chunk.mid, V) + 0.1, svg: tubeSvg(chunk, { tone: "mid" }) });
  items.push({ key: G.dot3([BOX.x + BOX.w / 2, BOX.y + BOX.d / 2, 8], V) + 5, svg: S(k.slabOf(BOX, 0, 16, P, 3, 0.5), { tone: "mid", inner: Ln(k.sideSeam(BOX, 11, P, 3), { tone: "faint" }) }) + Dots([at([BOX.x + 3, BOX.y + BOX.d, 13.5]), at([BOX.x + BOX.w - 3, BOX.y + BOX.d, 13.5])], { size: 0.5 }) });
  // the cone sits inside the ring: everything on the ring's near half is drawn after it
  items.push({ key: G.dot3([0, 0, 20], V) + 0.5, svg: coneSvg });
  items.push({ key: G.dot3([0, 0, 0], V) + 70, svg: waterDots, late: true });
  items.sort((a, b) => a.key - b.key);
  deluge.push(...items.map((item) => item.svg));
  back.push(...deluge);
}

// columns, splices, cable tray and ladder
const COLUMNS = [
  { c: [-COL, COL], name: "left", tray: true },
  { c: [COL, -COL], name: "right", ladder: true },
];
const SPLICES = [150, 300, 440];
for (const column of COLUMNS) {
  const [cx, cy] = column.c;
  const plan = { x: cx - COL_HALF, y: cy - COL_HALF, w: COL_HALF * 2, d: COL_HALF * 2, r: 2 };
  const base = { x: cx - 26, y: cy - 26, w: 52, d: 52, r: 3 };
  back.push(S(k.slabOf(base, 0, 3.2, P, 3, 0.6), { tone: "lo" }));
  back.push(Dots(k.corners(base, 6).map(([x, y]) => at([x, y, 3.2])), { size: 0.8, tone: "mid" }));
  back.push(Ln(k.corners(base, 6).map(([x, y]) => k.ring(x, y, 2.4, 3.2, P, 16)).join(""), { tone: "lo" }));
  fixed(A.slab(base, 0, 3.2, { name: "stand.column.base" }, 3));
  const stops = [3.2, ...SPLICES.flatMap((z) => [z - 4, z + 4]), BEAM_Z[0]];
  for (let i = 0; i < stops.length; i += 2) {
    back.push(S(k.slabOf(plan, stops[i], stops[i + 1] - stops[i], P, 3, 0.5), { tone: "mid" }));
    fixed(A.slab(plan, stops[i], stops[i + 1] - stops[i], { name: "stand.column" }, 3));
    if (i + 2 < stops.length) {
      const z = stops[i + 1];
      const collar = k.insetPlan(plan, -3);
      back.push(S(k.slabOf(collar, z, 8, P, 3, 0.5), { tone: "lo" }));
      const near = [[collar.x + collar.w, cy - 6], [collar.x + collar.w, cy + 6]].map(([x, y]) => [x, y, z + 4]);
      const left = [[cx - 6, collar.y + collar.d], [cx + 6, collar.y + collar.d]].map(([x, y]) => [x, y, z + 4]);
      back.push(Dots([...near, ...left].map(at), { size: 0.7, tone: "mid" }));
      fixed(A.slab(collar, z, 8, { name: "stand.splice" }, 3));
    }
  }
  if (column.tray) {
    // cable tray on the column's outer face, with clamps
    const y0 = cy + COL_HALF;
    const tray = { x: cx - 7, y: y0, w: 14, d: 4, r: 0.6 };
    back.push(S(k.slabOf(tray, 24, 490, P, 2, 0.3), { tone: "lo", inner: Ln([90, 210, 360].map((z) => k.sideSeam(tray, z, P, 2)).join(""), { tone: "faint" }) }));
    for (const z of [60, 130, 230, 330, 400, 470]) {
      const clamp = { x: cx - 8.5, y: y0 + 4, w: 17, d: 1.4, r: 0.4 };
      back.push(S(k.slabOf(clamp, z, 4, P, 2), { tone: "mid" }), Dots([at([cx - 6.5, y0 + 5.4, z + 2]), at([cx + 6.5, y0 + 5.4, z + 2])], { size: 0.45 }));
    }
  }
  if (column.ladder) {
    const x0 = cx + COL_HALF;
    const rail = (y) => ({ x: x0 + 6, y: y - 1.2, w: 2.4, d: 2.4, r: 0.6 });
    const rails = [cy - 8, cy + 8];
    for (const z of [40, 200, 360, 480]) for (const y of rails) back.push(S(k.slabOf({ x: x0, y: y - 1, w: 6, d: 2, r: 0.3 }, z, 2.4, P, 2), { tone: "lo" }));
    back.push(S(k.slabOf(rail(rails[0]), 12, 486, P, 2), { tone: "mid" }));
    for (let z = 30; z < 495; z += 22) {
      const F = G.frameOf([x0 + 7.2, rails[0] + 1.2, z], [0, 1, 0], [0, 0, 1], [1, 0, 0]);
      back.push(S(G.disc(0, 16 - 2.4, 0.9, F, P, { steps: 16 }), { tone: "lo" }));
    }
    back.push(S(k.slabOf(rail(rails[1]), 12, 486, P, 2), { tone: "mid" }));
  }
}
// the beam across the column tops
const BEAM_DIR = G.unit3([1, -1, 0]);
const BEAM_SIDE = G.unit3([1, 1, 0]);
const BEAM_F = G.frameOf([0, 0, (BEAM_Z[0] + BEAM_Z[1]) / 2], BEAM_DIR, BEAM_SIDE, UP);
{
  const half = (BEAM_Z[1] - BEAM_Z[0]) / 2;
  const poly = rect(-BEAM_HALF, BEAM_HALF, -half, half);
  fixed(A.prism(BEAM_F, poly, -BEAM_LEN, BEAM_LEN, { name: "stand.beam" }));
  const flange = (s) => Ln(path3([G.add3(centreOf(BEAM_F, s), G.add3(G.mul3(BEAM_SIDE, BEAM_HALF), G.mul3(UP, half))), G.add3(centreOf(BEAM_F, s), G.add3(G.mul3(BEAM_SIDE, BEAM_HALF), G.mul3(UP, -half)))]), { tone: "faint" });
  const webs = [-200, -120, -60, 60, 120, 200].map(flange).join("");
  back.push(S(G.prismOf(BEAM_F, poly, -BEAM_LEN, BEAM_LEN, P), { tone: "mid", inner: webs }));
  const ends = [-1, 1].flatMap((side) => [-5, 5].map((o) => at(G.add3(centreOf(BEAM_F, side * (BEAM_LEN - 8) + o), G.mul3(UP, half)))));
  back.push(Dots(ends, { size: 0.75, tone: "mid" }));
}

// ================================================================= the engine (front layer, depth-sorted)
const ENGINE = G.frameOf([0, 0, Z0], UP, [1, 0, 0], [0, 1, 0]);
const ez = (s) => Z0 + s;
// nozzle bell r(s), s up from the exit plane; it meets the chamber throat at s = 116 with the same slope
const bell = (s) => 65 - 0.1822 * s - 0.000956 * s * s;
const bellSlope = (s) => -0.1822 - 0.001912 * s;
const THROAT = { r: 24.2, c: 0.646, s: 146 };
const throat = (s) => Math.sqrt(THROAT.r ** 2 + (THROAT.c * (s - THROAT.s)) ** 2);
const throatSlope = (s) => (THROAT.c ** 2 * (s - THROAT.s)) / throat(s);
const S_ = { bellTop: 112.5, joint: 116, chamberFlange: 119.5, jacketTop: 182, headTop: 198, plateTop: 200, domeTop: 212, orpbTop: 248, otpTop: 288, gimbalTop: 308 };

// ---- 11 nozzle
const MANIFOLD = { s: 74, tube: 3.2 };
MANIFOLD.R = bell(MANIFOLD.s) + 4 + MANIFOLD.tube;
{
  const cuts = [16, 32, 48, 62, 86, 100];
  const BELL = G.bandsOf([[3.2, bell(3.2)], [S_.bellTop, bell(S_.bellTop)]], cuts, ENGINE, P, { radius: bell, slope: bellSlope, steps: 120, rows: 8 });
  BELL.bands.forEach((band, index) => {
    const shape = record(A.solid(ENGINE, band.profile, { name: "nozzle.bell", radius: bell, owner: "nozzle.body" }));
    put("nozzle", centreOf(ENGINE, (band.s0 + band.s1) / 2), S(band.paths, { tone: "hi", inner: index === 1 || index === 4 ? Ln(band.seam, { tone: "faint" }) : "" }), [shape]);
    band.shape = shape;
  });
  HOST.bell = BELL.bands;
  const sides = BELL.sidesOf(3.2, S_.bellTop, { ends: false });
  put("nozzle", centreOf(ENGINE, 60), Ln(sides.d, { tone: "hi" }), sides.points.map((points) => A.tube(points, 0.4 / KS, { name: "nozzle.outline", owner: "nozzle.body" })), { bias: 0.2, name: "nozzle.outline" });
  // lip ring and the dark of the exit
  const lip = record(A.ring(ENGINE, -1.6, 3.2, bell(0) - 3, bell(0) + 2.6, { name: "nozzle.lip", owner: "nozzle.body" }));
  const void_ = `<path class="rp-void" d="${G.circleOf(ENGINE, -1.6, bell(0) - 3, P)}"/>`;
  put("nozzle", centreOf(ENGINE, 0.8), void_ + S(G.ringBand(-1.6, 3.2, bell(0) - 3, bell(0) + 2.6, ENGINE, P), { tone: "mid" }) + Dots(G.dotsOf(ENGINE, 3.2, bell(0) + 1.4, 60, P, { all: true }), { size: 0.45, tone: "mid" }), [lip], { bias: -0.5 });
  // top flange, face to face with the chamber's
  const flange = record(A.disc(ENGINE, S_.bellTop, S_.joint, 35.5, { name: "nozzle.flange", owner: "nozzle.body" }));
  put("nozzle", centreOf(ENGINE, 114), S(G.disc(S_.bellTop, S_.joint, 35.5, ENGINE, P), { tone: "mid" }) + bolts(ENGINE, S_.joint, 33.4, 36, { size: 0.42 }), [flange]);
}


// ---- 06 injector and main chamber
const CHAMBER_BODY = "chamber.body";
const JACKET_RINGS = [[132, 135], [158, 161]];
const dome = (s) => 34 * Math.sqrt(Math.max(0, 1 - ((s - S_.plateTop) / 16) ** 2));
const domeSlope = (s) => {
  const x = Math.min(0.999, (s - S_.plateTop) / 16);
  return (-34 * x) / (16 * Math.sqrt(1 - x * x));
};
{
  const F = ENGINE;
  const owner = CHAMBER_BODY;
  disc("chamber", "chamber.flange", F, S_.joint, S_.chamberFlange, 35.5, { tone: "mid" }, { owner, extra: bolts(F, S_.chamberFlange, 33.2, 36, { all: true, size: 0.42 }) });
  const JACKET = G.bandsOf([[S_.chamberFlange, throat(S_.chamberFlange)], [S_.jacketTop, throat(S_.jacketTop)]], JACKET_RINGS.flat(), F, P, { radius: throat, slope: throatSlope, steps: 96, rows: 8 });
  HOST.jacket = [];
  for (const band of JACKET.bands) {
    if (JACKET_RINGS.some(([a, b]) => Math.abs(band.s0 - a) < 1e-6 && Math.abs(band.s1 - b) < 1e-6)) continue;
    const shape = record(A.solid(F, band.profile, { name: "chamber.jacket", radius: throat, owner }));
    const sides = JACKET.sidesOf(band.s0, band.s1, { ends: false });
    put("chamber", centreOf(F, (band.s0 + band.s1) / 2), S(band.paths, { tone: "hi" }) + Ln(sides.d, { tone: "hi" }), [shape]);
    HOST.jacket.push({ ...band, shape });
  }
  for (const [a, b] of JACKET_RINGS) {
    const r = throat((a + b) / 2) + 3.6;
    disc("chamber", "chamber.ring", F, a, b, r, { tone: "mid" }, { owner, extra: bolts(F, b, r - 1.6, 30, { all: true, size: 0.38 }) });
  }
  HOST.head = disc("chamber", "chamber.head", F, S_.jacketTop, S_.headTop, 38, { tone: "mid" }, {
    owner,
    inner: Ln(G.arcOf(F, 186, 38, P) + G.arcOf(F, 194, 38, P), { tone: "faint" }),
    extra: bolts(F, 190, 38, 40, { size: 0.42 }) + bolts(F, S_.headTop, 37, 40, { all: true, size: 0.4 }),
  });
  disc("chamber", "chamber.plate", F, S_.headTop, S_.plateTop, 36, { tone: "lo" }, { owner });
  const knots = Array.from({ length: 17 }, (_, i) => {
    const s = S_.plateTop + ((S_.domeTop - S_.plateTop) * i) / 16;
    return i === 0 || i === 16 ? [s, dome(s)] : [s, dome(s), 1];
  });
  HOST.dome = turned("chamber", "chamber.dome", F, knots, { tone: "hi" }, { owner, smooth: { slope: domeSlope, radius: dome } });
}

// ---- 03 oxygen-rich preburner
const ORPB_BODY = "orpb.body";
{
  const F = ENGINE;
  const owner = ORPB_BODY;
  disc("orpb", "orpb.flange", F, S_.domeTop, 216, 23.5, { tone: "mid" }, { owner, extra: bolts(F, 216, 21.2, 18, { all: true, size: 0.42 }) });
  HOST.orpb = disc("orpb", "orpb.body", F, 216, 244, 18.5, { tone: "hi" }, { owner, inner: Ln(G.arcOf(F, 224, 18.5, P) + G.arcOf(F, 236, 18.5, P), { tone: "faint" }) });
  disc("orpb", "orpb.flange", F, 244, S_.orpbTop, 23.5, { tone: "mid" }, { owner });
}

// ---- 02 oxygen turbopump
const OTP_VOLUTE = "otp.volute";
const LOX_PAD = { deg: 105, r: 6.6, s: 230 };
const LOX_T = { deg: LOX_PAD.deg, R: 58 };
const OTP_OUT = { s: 268, tube: 4.6 };
OTP_OUT.deg = LOX_T.deg - (Math.acos((22.3 + OTP_OUT.tube) / LOX_T.R) * 180) / Math.PI;
{
  const F = ENGINE;
  const owner = ORPB_BODY.replace("orpb", "otp");
  disc("otp", "otp.flange", F, S_.orpbTop, 252, 24, { tone: "mid" }, { owner, extra: bolts(F, 252, 23, 24, { all: true, size: 0.4 }) });
  HOST.otp = disc("otp", "otp.housing", F, 252, 276, 22, { tone: "hi" }, { owner: OTP_VOLUTE, inner: Ln(G.arcOf(F, 256, 22, P) + G.arcOf(F, 272, 22, P), { tone: "faint" }) });
  disc("otp", "otp.bearing", F, 276, 282, 17, { tone: "mid" }, { owner, extra: Faded(G.ribsOf(F, 276, 282, 17, 36, P, { fade: RIB_FADE }), { tone: "lo" }) });
  disc("otp", "otp.ring", F, 282, S_.otpTop, 30, { tone: "mid" }, { owner, extra: bolts(F, S_.otpTop, 27.2, 24, { all: true, size: 0.42 }) });
  for (const deg of [135, 315]) {
    const LF = G.frameAlong([0, 0, ez(285)], radial(deg));
    disc("otp", "otp.lug", LF, 29.9, 38 - Math.sqrt(16 - 1.8 * 1.8), 1.8, { tone: "mid" }, { owner });
  }
  // volute: a widening spiral that leaves the housing tangentially and ends in the outlet flange
  const VF = G.frameOf([0, 0, ez(OTP_OUT.s)], UP, [1, 0, 0], [0, 1, 0]);
  const a1 = rad(OTP_OUT.deg);
  const spiral = G.spiral(VF, 0, 22.3 + 1.6, 22.3 + OTP_OUT.tube, a1 - rad(300), a1, 40);
  const tangent = G.tangentOf(VF, a1);
  const end = spiral[spiral.length - 1];
  const outlet = [...spiral, G.add3(end, G.mul3(tangent, 14))];
  const radius = (t) => 1.6 + (OTP_OUT.tube - 1.6) * Math.min(1, t * 1.25);
  const otpGap = [[G.pathLength(outlet) - 2, G.pathLength(outlet)]];
  R.route(OTP_VOLUTE, outlet, radius, { piece: "otp", move: MOVE.otp, ends: [false, true], free: [false, true], rims: [1.6, OTP_OUT.tube + 2.2], gaps: otpGap });
  tubePieces(outlet, radius, P, { maxLength: 9, caps: [false, true], gaps: otpGap }).forEach((chunk, index) => put("otp", chunk.mid, tubeSvg(chunk, { tone: "hi" }), [A.tube(chunk.points, chunk.radii, { name: OTP_VOLUTE, owner: OTP_VOLUTE })], { name: `${OTP_VOLUTE}:${index}`, route: OTP_VOLUTE, chunk: index, bias: 0.05 }));
  const tip = outlet[outlet.length - 1];
  const OF = G.frameAlong(G.sub3(tip, G.mul3(tangent, 1)), tangent);
  disc("otp", "otp.outlet", OF, -1, 1, OTP_OUT.tube + 2.2, { tone: "mid" }, { owner: OTP_VOLUTE });
  OTP_OUT.face = tip;
  OTP_OUT.axis = tangent;
}

// ---- 01 gimbal and thrust puck
const PUCK = { s: 297.5, r: 18.4, a: 3.4 / 6.5 ** 4 };
const puck = (s) => PUCK.r - PUCK.a * Math.abs(s - PUCK.s) ** 4;
const puckSlope = (s) => -4 * PUCK.a * Math.abs(s - PUCK.s) ** 3 * Math.sign(s - PUCK.s);
const PLAN_F = (z) => G.frameOf([0, 0, z], UP, BEAM_DIR, BEAM_SIDE);
{
  const F = ENGINE;
  const owner = "gimbal.body";
  disc("gimbal", "gimbal.flange", F, S_.otpTop, 291, 24, { tone: "mid" }, { owner, extra: bolts(F, 291, 21, 20, { all: true, size: 0.42 }) });
  const knots = Array.from({ length: 21 }, (_, i) => {
    const s = 291 + (13 * i) / 20;
    return i === 0 || i === 20 ? [s, puck(s)] : [s, puck(s), 1];
  });
  turned("gimbal", "gimbal.puck", F, knots, { tone: "hi" }, { owner, smooth: { slope: puckSlope, radius: puck } });
  prism("gimbal", "gimbal.plate", PLAN_F(0), rect(-23, 23, -23, 23), ez(304), ez(S_.gimbalTop), { tone: "mid" }, { owner, extra: Dots([[-18, -18], [18, -18], [-18, 18], [18, 18]].map(([u, v]) => at(G.add3(G.add3([0, 0, ez(S_.gimbalTop)], G.mul3(BEAM_DIR, u)), G.mul3(BEAM_SIDE, v)))), { size: 0.6, tone: "mid" }) });
}

// ---- stand hardware in front: load cell, crosshead, actuators, feed line
const LOAD = { z0: ez(S_.gimbalTop), z1: ez(S_.gimbalTop) + 15, r: 12 };
const CROSS = { z0: LOAD.z1, z1: BEAM_Z[0], along: 36, across: 19 };
{
  const F = G.frameOf([0, 0, 0], UP, [1, 0, 0], [0, 1, 0]);
  HOST.load = disc("stand", "stand.loadcell", F, LOAD.z0, LOAD.z1, LOAD.r, { tone: "hi" }, { inner: Ln(G.arcOf(F, LOAD.z0 + 3, LOAD.r, P) + G.arcOf(F, LOAD.z1 - 3, LOAD.r, P), { tone: "faint" }), extra: Faded(G.ribsOf(F, LOAD.z0 + 3, LOAD.z1 - 3, LOAD.r, 40, P, { fade: RIB_FADE }), { tone: "lo" }) });
  HOST.cross = prism("stand", "stand.crosshead", PLAN_F(0), rect(-CROSS.along, CROSS.along, -CROSS.across, CROSS.across), CROSS.z0, CROSS.z1, { tone: "mid" }, {
    extra: Dots([-28, -12, 12, 28].map((u) => at(G.add3(G.add3([0, 0, CROSS.z1 - 4], G.mul3(BEAM_DIR, u)), G.mul3(BEAM_SIDE, CROSS.across)))), { size: 0.6, tone: "mid" }),
  });
  // gland on the load cell and its cable up into the crosshead
  const GF = G.frameAlong([0, 0, LOAD.z0 + 7.5], radial(0));
  disc("stand", "stand.gland", GF, LOAD.r - 0.3, LOAD.r + 3.4, 2.4, { tone: "mid" });
  disc("stand", "stand.gland.nut", GF, LOAD.r + 3.4, LOAD.r + 5.6, 3, { tone: "lo" }, { extra: Faded(G.ribsOf(GF, LOAD.r + 3.4, LOAD.r + 5.6, 3, 12, P, { fade: RIB_FADE }), { tone: "lo" }) });
  const g = G.add3([0, 0, LOAD.z0 + 7.5], radial(0, LOAD.r + 5.6));
  cable("stand", "stand.loadcell.cable", [g, G.add3(g, radial(0, 5)), radial(0, LOAD.r + 10.6, CROSS.z0)], 0.7, { shells: [false, true], free: [false, false], list: null, tone: "mid" });
}
function actuator(deg) {
  const name = `stand.actuator.${deg}`;
  const E = [...radial(deg, 38).slice(0, 2), ez(285)];
  const T = [...radial(deg, 58).slice(0, 2), BEAM_Z[0] - 14];
  const axis = G.unit3(G.sub3(T, E));
  const L = G.len3(G.sub3(T, E));
  const u = G.unit3(G.cross3(axis, radial(deg)));
  const F = G.frameOf(E, axis, u, G.cross3(axis, u));
  ball("stand", `${name}.eye`, E, 4, { tone: "mid" }, { owner: name });
  disc("stand", `${name}.rod`, F, Math.sqrt(16 - 1.8 * 1.8), 15, 1.8, { tone: "hi" }, { owner: name });
  turned("stand", `${name}.barrel`, F, [[15, 4.4], [31, 4.4]], { tone: "hi" }, { owner: name, inner: Ln(G.arcOf(F, 18, 4.4, P) + G.arcOf(F, 28, 4.4, P), { tone: "faint" }) });
  const offset = 9.6;
  prism("stand", `${name}.gearbox`, F, G.stadium(5.6, 4, offset), 31, 34.6, { tone: "mid" }, { owner: name, extra: Dots([0, offset].map((u) => at(G.add3(centreOf(F, G.dot3(F.a, V) > 0 ? 34.6 : 31), G.mul3(F.u, u)))), { size: 0.5 }) });
  const MF = G.frameOf(G.add3(E, G.mul3(u, offset)), axis, u, G.cross3(axis, u));
  turned("stand", `${name}.motor`, MF, [[17.5, 2.6], [18.4, 3.4], [31, 3.4]], { tone: "mid" }, { owner: name, extra: Faded(G.ribsOf(MF, 20, 30, 3.4, 18, P, { fade: RIB_FADE, seams: true }), { tone: "lo" }) });
  turned("stand", `${name}.clevis`, F, [[34.6, 3], [L - 5.4, 3], [L - 5.4, 1.7], [L - Math.sqrt(16 - 1.7 * 1.7), 1.7]], { tone: "mid" }, { owner: name });
  ball("stand", `${name}.pivot`, T, 4, { tone: "mid" }, { owner: name });
  const BF = G.frameOf([...T.slice(0, 2), 0], UP, BEAM_DIR, BEAM_SIDE);
  prism("stand", `${name}.bracket`, BF, rect(-7, 7, -8, 8), T[2] + 4, BEAM_Z[0], { tone: "lo" });
}
actuator(135);
actuator(315);

// ---- 08 methane turbopump and fuel-rich preburner
const FTP_VOLUTE = "ftp.volute";
const FTP_Z = { pb0: 292, pb1: 350, tb0: 350, tb1: 388, nk1: 396, pump1: 426, inlet1: 430, volute: 411, hot: 370 };
const FTP_F = G.frameOf([FTP_C[0], FTP_C[1], 0], UP, [1, 0, 0], [0, 1, 0]);
const TO_AXIS = G.mul3(OUT_TO_FTP, -1);
const DC = { tube: 4, valveZ: 322, deg: 10 };
DC.top = radial(DC.deg, bell(74) + 4 + 3.2, FTP_Z.volute);
const FTP_OUT = { tube: 5, rho: 19.3 + 5 };
{
  const owner = "ftp.body";
  const pbDome = (z) => (z < FTP_Z.pb0 + 8 ? 13 * Math.sqrt(Math.max(0, 1 - ((FTP_Z.pb0 + 8 - z) / 8) ** 2)) : 13);
  const pbSlope = (z) => {
    if (z >= FTP_Z.pb0 + 8) return 0;
    const x = Math.min(0.999, (FTP_Z.pb0 + 8 - z) / 8);
    return (13 * x) / (8 * Math.sqrt(1 - x * x));
  };
  const knots = [...Array.from({ length: 12 }, (_, i) => {
    const z = FTP_Z.pb0 + 0.25 + (7.75 * i) / 11;
    return i === 0 ? [z, pbDome(z)] : [z, pbDome(z), 1];
  }), [FTP_Z.pb1 - 4, 13]];
  HOST.ftpPb = turned("ftp", "ftp.preburner", FTP_F, knots, { tone: "hi" }, { owner, smooth: { slope: pbSlope, radius: pbDome }, inner: Ln(G.arcOf(FTP_F, 318, 13, P) + G.arcOf(FTP_F, 334, 13, P), { tone: "faint" }) });
  disc("ftp", "ftp.preburner.flange", FTP_F, FTP_Z.pb1 - 4, FTP_Z.pb1, 16.5, { tone: "mid" }, { owner, extra: bolts(FTP_F, FTP_Z.pb1, 15, 16, { all: true, size: 0.4 }) });
  HOST.ftpTurbine = turned("ftp", "ftp.turbine", FTP_F, [[FTP_Z.tb0, 15.5], [FTP_Z.tb0 + 1.5, 19], [FTP_Z.tb1 - 1.5, 19], [FTP_Z.tb1, 15.5]], { tone: "hi" }, { owner, inner: Ln(G.arcOf(FTP_F, 360, 19, P) + G.arcOf(FTP_F, 380, 19, P), { tone: "faint" }) });
  disc("ftp", "ftp.neck", FTP_F, FTP_Z.tb1, FTP_Z.nk1, 9, { tone: "mid" }, { owner });
  HOST.ftpPump = disc("ftp", "ftp.housing", FTP_F, FTP_Z.nk1, FTP_Z.pump1, 19, { tone: "hi" }, { owner: FTP_VOLUTE, inner: Ln(G.arcOf(FTP_F, 400, 19, P) + G.arcOf(FTP_F, 422, 19, P), { tone: "faint" }) });
  disc("ftp", "ftp.inlet", FTP_F, FTP_Z.pump1, FTP_Z.inlet1, 12, { tone: "mid" }, { owner, extra: bolts(FTP_F, FTP_Z.inlet1, 10.4, 12, { all: true, size: 0.4 }) });
  // volute heading for the downcomer's drop
  const q = G.sub3(DC.top, [FTP_C[0], FTP_C[1], FTP_Z.volute]);
  const a1 = Math.atan2(q[1], q[0]) - Math.acos(FTP_OUT.rho / Math.hypot(q[0], q[1]));
  const VF = G.frameOf([FTP_C[0], FTP_C[1], FTP_Z.volute], UP, [1, 0, 0], [0, 1, 0]);
  const spiral = G.spiral(VF, 0, 19.3 + 1.6, FTP_OUT.rho, a1 - rad(300), a1, 40);
  const tangent = G.tangentOf(VF, a1);
  const end = spiral[spiral.length - 1];
  const outlet = [...spiral, G.add3(end, G.mul3(tangent, 14))];
  const radius = (t) => 1.6 + (FTP_OUT.tube - 1.6) * Math.min(1, t * 1.25);
  const ftpGap = [[G.pathLength(outlet) - 2, G.pathLength(outlet)]];
  R.route(FTP_VOLUTE, outlet, radius, { piece: "ftp", move: MOVE.ftp, ends: [false, true], free: [false, true], rims: [1.6, FTP_OUT.tube + 2.2], gaps: ftpGap });
  tubePieces(outlet, radius, P, { maxLength: 9, caps: [false, true], gaps: ftpGap }).forEach((chunk, index) => put("ftp", chunk.mid, tubeSvg(chunk, { tone: "hi" }), [A.tube(chunk.points, chunk.radii, { name: FTP_VOLUTE, owner: FTP_VOLUTE })], { name: `${FTP_VOLUTE}:${index}`, route: FTP_VOLUTE, chunk: index, bias: 0.05 }));
  const tip = outlet[outlet.length - 1];
  disc("ftp", "ftp.outlet", G.frameAlong(G.sub3(tip, G.mul3(tangent, 1)), tangent), -1, 1, FTP_OUT.tube + 2.2, { tone: "mid" }, { owner: FTP_VOLUTE });
  FTP_OUT.face = tip;
  FTP_OUT.axis = tangent;
  // the pad the hot-gas duct bolts to, cut to the turbine
  HOST.ftpHotPad = pad("ftp", "ftp.hotpad", HOST.ftpTurbine, G.frameAlong([FTP_C[0], FTP_C[1], FTP_Z.hot], TO_AXIS), 7.6, 22, { tone: "mid" }, { from: 8 });
}

// ---- 07 hot-gas manifold: turbine exhaust into the chamber head
{
  HOST.headHotPad = pad("chamber", "chamber.hotpad", HOST.head, G.frameAlong([0, 0, FTP_Z.hot], OUT_TO_FTP), 7.6, 44, { tone: "mid" }, { from: 30 });
  const from = G.add3([FTP_C[0], FTP_C[1], FTP_Z.hot], G.mul3(TO_AXIS, 22));
  const to = G.add3([0, 0, FTP_Z.hot], G.mul3(OUT_TO_FTP, 44));
  pipe("hotgas", "hotgas.duct", [from, to], 5.6, { flangeR: 7.6, flangeT: 2, bands: [0.5], maxLength: 8, free: [true, true] });
}

// ---- struts: ball studs on the chamber, rods leaving with the methane unit
function stud(piece, name, F, from, owner) {
  disc(piece, `${name}.stem`, F, from, from + 4.6, 1.3, { tone: "mid" }, { owner });
  const c = centreOf(F, from + 4.6 + Math.sqrt(2.2 * 2.2 - 1.3 * 1.3));
  ball(piece, `${name}.ball`, c, 2.2, { tone: "mid" }, { owner });
  return c;
}
for (const [i, [deg, s, z]] of [[328, 126, 316], [352, 150, 334], [330, 172, 356]].entries()) {
  const r = throat(s);
  const hostF = G.frameAlong([0, 0, ez(s)], radial(deg));
  const a = stud("chamber", `chamber.stud${i}`, hostF, r - 0.5, CHAMBER_BODY);
  const toward = G.unit3(G.sub3([a[0], a[1], z], [FTP_C[0], FTP_C[1], z]));
  const host = z < FTP_Z.pb1 ? 13 : 19;
  const ftpF = G.frameAlong([FTP_C[0], FTP_C[1], z], toward);
  const b = stud("ftp", `ftp.stud${i}`, ftpF, host - 0.5, "ftp.body");
  const L = G.len3(G.sub3(b, a));
  const RF = G.frameAlong(a, G.sub3(b, a));
  const cutIn = Math.sqrt(2.2 * 2.2 - 1.1 * 1.1);
  disc("ftp", `ftp.strut${i}`, RF, cutIn, L - cutIn, 1.1, { tone: "hi" }, { owner: `ftp.strut${i}` });
}

// ---- feed line: a bracket cantilevered off the beam, the line dropping to the methane pump inlet
{
  const along = G.dot3(FTP_C, BEAM_DIR);
  const out = G.dot3(FTP_C, BEAM_SIDE);
  const BF = G.frameOf([0, 0, 0], UP, BEAM_DIR, BEAM_SIDE);
  prism("stand", "stand.feed.bracket", BF, rect(along - 10, along + 10, -6, out + 10), BEAM_Z[0] - 7, BEAM_Z[0], { tone: "lo" }, {
    extra: Dots([-6, 6].map((u) => at(G.add3(G.add3([0, 0, BEAM_Z[0]], G.mul3(BEAM_DIR, along + u)), G.mul3(BEAM_SIDE, BEAM_HALF + 3)))), { size: 0.55 }),
  });
  pipe("stand", "stand.feed", [[FTP_C[0], FTP_C[1], BEAM_Z[0] - 7], [FTP_C[0], FTP_C[1], FTP_Z.inlet1]], 5.2, { flangeR: 8.2, flangeT: 2, bellows: [0.3, 0.5, 7], bands: [0.75], free: [false, true], maxLength: 20 });
}

// ---- 11 nozzle (continued): the cooling manifold round the bell, its pads and port tees
const MANI = "nozzle.manifold";
const TEES = [DC.deg, DC.deg + 120, DC.deg + 240];
const TEE = { r: 6.2, port: 5, face: 8.5 };
{
  const F = G.frameOf([0, 0, ez(MANIFOLD.s)], UP, [1, 0, 0], [0, 1, 0]);
  const start = rad(TEES[0]);
  const points = G.arcPoints(F, 0, MANIFOLD.R, start, start + Math.PI * 2, 180);
  const total = G.pathLength(points);
  const cut = Math.sqrt(TEE.r * TEE.r - MANIFOLD.tube * MANIFOLD.tube);
  const gaps = [[0, cut], [total - cut, total], [total / 3 - cut, total / 3 + cut], [(2 * total) / 3 - cut, (2 * total) / 3 + cut]];
  // break chunks where the ring passes the bell's limbs
  const limbs = [rad(45 + 90), rad(45 - 90)];
  const breaks = limbs.map((a) => (((a - start) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) * MANIFOLD.R);
  R.route(MANI, points, MANIFOLD.tube, { piece: "nozzle", move: MOVE.nozzle, gaps, closed: true });
  tubePieces(points, MANIFOLD.tube, P, { maxLength: 10, gaps, breaks }).forEach((chunk, index) => put("nozzle", chunk.mid, tubeSvg(chunk, { tone: "hi" }), [A.tube(chunk.points, chunk.radii, { name: MANI, owner: MANI })], { name: `${MANI}:${index}`, route: MANI, chunk: index, bias: 0.05 }));
  const band = HOST.bell.find((b) => b.s0 <= MANIFOLD.s && b.s1 >= MANIFOLD.s);
  for (const deg of [40, 100, 160, 220, 280, 340]) pad("nozzle", "nozzle.standoff", band.shape, G.frameAlong([0, 0, ez(MANIFOLD.s)], radial(deg)), 1.8, MANIFOLD.R - MANIFOLD.tube, { tone: "mid" }, { from: 38, owner: MANI });
  TEES.forEach((deg, index) => {
    const c = [...radial(deg, MANIFOLD.R).slice(0, 2), ez(MANIFOLD.s)];
    ball("nozzle", `${MANI}.tee`, c, TEE.r, { tone: "hi" }, { owner: MANI });
    const PF = G.frameAlong(c, UP);
    disc("nozzle", `${MANI}.port`, PF, Math.sqrt(TEE.r ** 2 - TEE.port ** 2), TEE.face, TEE.port, { tone: "mid" }, { owner: MANI });
    if (index) disc("nozzle", `${MANI}.blank`, PF, TEE.face, TEE.face + 2, TEE.port, { tone: "lo" }, { owner: MANI, extra: bolts(PF, TEE.face + 2, TEE.port * 0.72, 6, { all: true, size: 0.42 }) });
  });
}

// ---- 09 downcomer and main fuel valve
{
  // a pure drop: it slides off the volute's outlet face and lands clear of the nozzle, which leaves first
  MOVE.downcomer = [0, 0, -84];
  const face = radial(DC.deg, MANIFOLD.R, ez(MANIFOLD.s) + TEE.face);
  const top = G.len3(G.sub3(DC.top, FTP_OUT.face));
  const dc = pipe("downcomer", "downcomer", [FTP_OUT.face, DC.top, face], DC.tube, {
    flangeR: [FTP_OUT.tube + 2.2, TEE.port], flangeT: 2, bellows: [{ s: top + 19 }, { s: top + 31 }, 6], bands: [{ s: top / 2 }, { s: top + 64 }, { s: -14 }], maxLength: 12,
    valve: { at: { s: top + (FTP_Z.volute - DC.valveZ) }, length: 18, side: radial(60), can: 4 }, free: [true, true], bend: 11,
  });
  HOST.fuelValve = dc.collars.find((c) => c.kind === "valve");
}

// ---- 04 oxygen duct and main oxidiser valve: across the front, down, and into the preburner
{
  const t = OTP_OUT.axis;
  MOVE.lox = G.add3(G.add3(G.mul3(t, 22), radial(LOX_PAD.deg, 22)), [0, 0, -34]);
  HOST.orpbLoxPad = pad("orpb", "orpb.loxpad", HOST.orpb, G.frameAlong([0, 0, ez(LOX_PAD.s)], radial(LOX_PAD.deg)), LOX_PAD.r, 24.5, { tone: "mid" }, { from: 10 });
  const corner = radial(LOX_T.deg, LOX_T.R, OTP_OUT.face[2]);
  const lowCorner = radial(LOX_T.deg, LOX_T.R, ez(LOX_PAD.s));
  const end = radial(LOX_PAD.deg, 24.5, ez(LOX_PAD.s));
  const lox = pipe("lox", "lox.duct", [OTP_OUT.face, corner, lowCorner, end], OTP_OUT.tube, {
    flangeR: [OTP_OUT.tube + 2.2, LOX_PAD.r], flangeT: 2, bands: [{ s: G.len3(G.sub3(corner, OTP_OUT.face)) + 19 }], maxLength: 12, bend: 16, free: [true, true],
    valve: { at: { s: 11 }, length: 16, side: UP, can: 3.8 },
  });
  HOST.oxValve = lox.collars.find((c) => c.kind === "valve");
}


// ================================================================= small hardware on the stack
const tangent = (deg) => radial(deg + 90);
const ringAt = (deg, r, z, c = [0, 0]) => [c[0] + r * Math.cos(rad(deg)), c[1] + r * Math.sin(rad(deg)), z];
const bandAt = (s) => HOST.jacket.find((band) => band.s0 <= s + 1e-6 && band.s1 >= s - 1e-6).shape;

// a boss on a round host: a saddle pad from the host's skin out to its face, owned with the host's body
function boss(piece, name, host, deg, z, a, face, { c = [0, 0], owner, from } = {}) {
  const F = G.frameAlong([c[0], c[1], z], radial(deg));
  pad(piece, name, host, F, a, face, { tone: "mid" }, { from: from ?? face - 9, owner, extra: facesViewer(radial(deg)) ? faceRing(F, face, a * 0.55) : "" });
  return { F, face: centreOf(F, face), axis: radial(deg) };
}

// a small line from port to port, with its own little end fittings
function line(piece, name, points, r = 1.2, opts = {}) {
  const out = pipe(piece, name, points, r, { flangeR: r + 1, flangeT: Math.max(1, r * 0.9), maxLength: 9, bend: Math.max(2.6, r * 2.6), tone: "mid", ...opts });
  (opts.list ?? LINES.small).push(name);
  return out;
}

// ---- 05 engine controller, junction box and harness
const CB = { deg: 75 };
const CBF = G.frameOf([0, 0, 0], UP, radial(CB.deg), tangent(CB.deg));
const cb = (u, v, z) => [CBF.u[0] * u + CBF.v[0] * v, CBF.u[1] * u + CBF.v[1] * v, z];
const BOX = { u0: 41, u1: 55, v0: -14, v1: 14, z0: 328, z1: 352 };
const JB = { u0: 44, u1: 52, v0: 14, v1: 23, z0: 332, z1: 346 };
const SENSE = { u0: 32, u1: 46, v0: -37, v1: -19, z0: 340, z1: 350 };
const worldRing = (u0, u1, v0, v1) => rect(u0, u1, v0, v1).map(([u, v]) => cb(u, v, 0).slice(0, 2));
{
  const seam = Ln(k.ringSeam(worldRing(BOX.u0, BOX.u1, BOX.v0, BOX.v1), BOX.z1 - 3, P), { tone: "faint" });
  const screws = Dots([[BOX.u0 + 2.5, BOX.v0 + 2.5], [BOX.u1 - 2.5, BOX.v0 + 2.5], [BOX.u0 + 2.5, BOX.v1 - 2.5], [BOX.u1 - 2.5, BOX.v1 - 2.5]].map(([u, v]) => at(cb(u, v, BOX.z1))), { size: 0.55, tone: "mid" });
  const fins = Ln([-9, -5, -1, 3, 7].map((v) => path3([cb(BOX.u1, v, BOX.z0 + 4), cb(BOX.u1, v, BOX.z1 - 5)])).join(""), { tone: "lo", free: true });
  prism("controller", "controller.box", CBF, rect(BOX.u0, BOX.u1, BOX.v0, BOX.v1), BOX.z0, BOX.z1, { tone: "hi" }, { inner: seam, extra: screws + fins });
  const ringR = throat((JACKET_RINGS[1][0] + JACKET_RINGS[1][1]) / 2) + 3.6;
  for (const v of [-7, 7]) prism("controller", "controller.bracket", CBF, rect(Math.sqrt(ringR ** 2 - (Math.abs(v) - 1.2) ** 2) - 0.3, BOX.u0, v - 1.2, v + 1.2), ez(JACKET_RINGS[1][0]) + 0.4, ez(JACKET_RINGS[1][1]) - 0.4, { tone: "lo" });
  prism("controller", "controller.junction", CBF, rect(JB.u0, JB.u1, JB.v0, JB.v1), JB.z0, JB.z1, { tone: "mid" }, { extra: Dots([[JB.u1, JB.v0 + 2], [JB.u1, JB.v1 - 2]].map(([u, v]) => at(cb(u, v, JB.z1 - 2))), { size: 0.5 }) });
}
const CONNECTORS = [];
function connector(name, at3, axis, length = 2.4, r = 1.5) {
  const F = G.frameAlong(at3, axis);
  disc("controller", name, F, 0, length, r, { tone: "lo" }, { extra: facesViewer(axis) ? faceRing(F, length, r * 0.5, "lo") : "" });
  CONNECTORS.push(name);
  return centreOf(F, length);
}
// clamp studs on the chamber head hold the rising harness
const CLAMP_Z = 370;
function clampOn(name, deg, r) {
  const F = G.frameAlong([0, 0, CLAMP_Z], radial(deg));
  disc("chamber", `chamber.stud.${name}`, F, 37.6, r - 1.8, 0.9, { tone: "mid" }, { owner: CHAMBER_BODY });
  const CF = G.frameAlong(ringAt(deg, r, CLAMP_Z), UP);
  turned("controller", `${name}.clamp`, CF, [[-0.9, 1.8], [0.9, 1.8]], { tone: "mid" }, { anchor: false, fitting: true, owner: name });
  return { c: ringAt(deg, r, CLAMP_Z), axis: UP, r: 1.8 };
}
const HARNESS_R = 50;
const rising = [
  { name: "harness.exciter", deg: 61, z: ez(226) },
  { name: "harness.pickup", deg: 67, z: ez(256) },
  { name: "harness.mov", deg: 73.5, z: 464 },
];
{
  HOST.orpbExciter = boss("orpb", "orpb.exciter", HOST.orpb, 61, ez(226), 1.8, 22);
  HOST.otpPickup = boss("otp", "otp.pickup", HOST.otp, 67, ez(256), 1.8, 25.5);
  const CAN = G.frameAlong([HOST.oxValve.F.o[0], HOST.oxValve.F.o[1], 464], radial(45));
  disc("lox", "lox.duct.valve.socket", CAN, 3.5, 6, 1.4, { tone: "lo" }, { owner: "lox.duct", ride: "lox" });
  const canFace = centreOf(CAN, 6);
  for (const h of rising) {
    const start = connector(`controller.connector.${h.deg}`, ringAt(h.deg, HARNESS_R, BOX.z1), UP);
    const clamp = clampOn(h.name, h.deg, HARNESS_R);
    let points;
    if (h.name === "harness.exciter") points = [start, ringAt(h.deg, HARNESS_R, h.z), HOST.orpbExciter.face];
    else if (h.name === "harness.pickup") points = [start, ringAt(h.deg, HARNESS_R, h.z), HOST.otpPickup.face];
    else points = [start, ringAt(h.deg, HARNESS_R, h.z), canFace];
    cable("controller", h.name, points, 0.6, { shells: [false, true], clamps: [clamp], touch: [`${h.name}.clamp`], bend: 4 });
  }
  // two cables leave the right face, under the sense block, for the methane side
  const right = G.mul3(CBF.v, -1);
  const exciterFace = ringAt(110, 18, 334, FTP_C);
  HOST.ftpExciter = boss("ftp", "ftp.exciter", HOST.ftpPb, 110, 334, 1.8, 18, { c: FTP_C, owner: "ftp.body" });
  const s1 = connector("controller.connector.ftp", cb(47, BOX.v0, 334), right);
  cable("controller", "harness.ftp-exciter", [s1, cb(47, BOX.v0 - 8, 334), ringAt(110, 30, 334, FTP_C), exciterFace], 0.6, { shells: [false, true], bend: 5 });
  const mfv = HOST.fuelValve;
  const s2 = connector("controller.connector.mfv", cb(51, BOX.v0, 330), right);
  const ap = G.add3(mfv.lid, G.mul3(mfv.lidAxis, 8));
  cable("controller", "harness.mfv", [s2, cb(51, BOX.v0 - 7, 330), [ap[0], ap[1] + 13, mfv.lid[2]], ap, mfv.lid], 0.6, { shells: [false, true], bend: 5 });
  // junction box to the sense block, under the controller
  const s3 = connector("controller.connector.sense", cb(48, 18.5, JB.z0), [0, 0, -1], 2);
  cable("controller", "harness.sense", [s3, cb(48, 18.5, 325), cb(37, -30, 325), cb(37, -30, SENSE.z0)], 0.6, { ends: [true, true], bend: 4 });
}

// ---- 10 plumbing: the sense block and its seven lines (they ride the controller's spring)
{
  prism("plumbing", "plumbing.senseblock", CBF, rect(SENSE.u0, SENSE.u1, SENSE.v0, SENSE.v1), SENSE.z0, SENSE.z1, { tone: "mid" }, {
    ride: "controller",
    inner: Ln(k.ringSeam(worldRing(SENSE.u0, SENSE.u1, SENSE.v0, SENSE.v1), SENSE.z0 + 3, P), { tone: "faint" }),
  });
  prism("plumbing", "plumbing.senseblock.bracket", CBF, rect(40, 46, SENSE.v1, BOX.v0), 342, 347, { tone: "lo" }, { ride: "controller" });
  const ports = [
    { deg: 30, host: HOST.otp, z: 438, face: 25.5, piece: "otp" },
    { deg: 33, host: HOST.otp, z: 434, face: 25.5, piece: "otp" },
    { deg: 36, host: HOST.orpb, z: 416, face: 22, piece: "orpb" },
    { deg: 39, host: HOST.orpb, z: 404, face: 22, piece: "orpb" },
    { deg: 42, host: HOST.dome, z: 386, face: 35.5, piece: "chamber" },
    { deg: 45, host: HOST.head, z: 374, face: 41.5, piece: "chamber" },
    { deg: 48, host: HOST.head, z: 366, face: 41.5, piece: "chamber" },
  ];
  ports.forEach((port, i) => {
    const b = boss(port.piece, `${port.piece}.sense${i}`, port.host, port.deg, port.z, 2, port.face, { owner: `${port.piece}.body` });
    line("plumbing", `plumbing.sense${i}`, [ringAt(port.deg, 49, SENSE.z1), ringAt(port.deg, 49, port.z), b.face], 0.9, { ride: "controller", free: [false, true], flangeR: 1.8, list: LINES.sense });
  });
}

// ---- 10 plumbing: three pressure transducers on the chamber with pigtails (they ride the chamber)
for (const [i, deg] of [113, 122, 131].entries()) {
  const s = 172;
  const z = ez(s);
  const host = bandAt(s);
  const F = G.frameAlong([0, 0, z], radial(deg));
  pad("plumbing", `plumbing.transducer${i}.boss`, host, F, 1.8, throat(s) + 2.2, { tone: "mid" }, { ride: "chamber", from: throat(s) - 6 });
  disc("plumbing", `plumbing.transducer${i}`, F, throat(s) + 2.2, throat(s) + 8, 1.6, { tone: "hi" }, { ride: "chamber", inner: Ln(G.arcOf(F, throat(s) + 5, 1.6, P), { tone: "faint" }) });
  disc("plumbing", `plumbing.transducer${i}.tip`, F, throat(s) + 8, throat(s) + 9.6, 1.1, { tone: "mid" }, { ride: "chamber" });
  const r0 = throat(s) + 9.6;
  const loop = [ringAt(deg, r0, z), ringAt(deg, r0 + 1.5, z)];
  for (let j = 1; j < 12; j++) {
    const phi = (j / 12) * Math.PI;
    loop.push(ringAt(deg, r0 + 1.5 + 3 * Math.sin(phi), z - 3 + 3 * Math.cos(phi)));
  }
  const sEnd = s - 6;
  loop.push(ringAt(deg, r0 + 1.5, z - 6), ringAt(deg, throat(sEnd), ez(sEnd)));
  cable("plumbing", `plumbing.pigtail${i}`, loop, 0.45, { ride: "chamber", bend: 0.9, perArc: 4, tone: "lo", list: null });
}

// ---- 10 plumbing on the far side: purge, igniter and pressurisation lines, jacket lines and the oxygen feed to the fuel preburner
{
  const otpBoss = (deg) => boss("otp", `otp.port${deg}`, HOST.otp, deg, 438, 2.4, 25.5, { owner: "otp.body" });
  // pressurisation lines up to quick-disconnects hung behind the beam
  for (const [i, deg] of [160, 290].entries()) {
    const b = otpBoss(deg);
    const top = 494;
    line("plumbing", `plumbing.press${i}`, [b.face, ringAt(deg, 46.5, 438), ringAt(deg, 46.5, top)], 1.2, { couplings: [false, true], free: [true, true] });
    const QF = G.frameAlong(ringAt(deg, 46.5, top), UP);
    disc("stand", `stand.qd${i}`, QF, 0, 8, 3.4, { tone: "mid" }, { extra: Faded(G.ribsOf(QF, 1, 7, 3.4, 18, P, { fade: RIB_FADE, seams: true }), { tone: "lo" }) });
    const q = ringAt(deg, 46.5, 0);
    const along = G.dot3(q, BEAM_DIR);
    const BF = G.frameOf([0, 0, 0], UP, BEAM_DIR, BEAM_SIDE);
    prism("stand", `stand.qd${i}.arm`, BF, rect(along - 5, along + 5, G.dot3(q, BEAM_SIDE) - 4, -8), top + 8, top + 11, { tone: "lo" });
    prism("stand", `stand.qd${i}.hanger`, BF, rect(along - 5, along + 5, -11, -8), top + 11, BEAM_Z[0], { tone: "lo" });
  }
  // purge lines from the oxygen pump down to the chamber head
  for (const [i, deg] of [205, 245].entries()) {
    const b = otpBoss(deg);
    const h = boss("chamber", `chamber.purge${i}`, HOST.head, deg, 372, 2.4, 41.5, { owner: CHAMBER_BODY });
    line("plumbing", `plumbing.purge${i}`, [b.face, ringAt(deg, 48, 438), ringAt(deg, 48, 372), h.face], 1.2, { free: [true, true] });
  }
  // igniter lines into the plugs of both preburners
  {
    const b = otpBoss(225);
    const p0 = boss("orpb", "orpb.igniter", HOST.orpb, 225, 414, 2.4, 21, { owner: ORPB_BODY });
    disc("orpb", "orpb.igniter.plug", p0.F, 21, 24.5, 2.4, { tone: "hi" }, { owner: ORPB_BODY });
    line("plumbing", "plumbing.igniter0", [b.face, ringAt(225, 31, 438), ringAt(225, 31, 414), ringAt(225, 24.5, 414)], 1.2, { free: [true, true] });
    const pump = boss("ftp", "ftp.igniter.tap", HOST.ftpPump, 250, 401, 2.4, 21.5, { c: FTP_C, owner: "ftp.body" });
    const plug = boss("ftp", "ftp.igniter", HOST.ftpPb, 250, 336, 2.4, 15.5, { c: FTP_C, owner: "ftp.body" });
    disc("ftp", "ftp.igniter.plug", plug.F, 15.5, 18, 2.4, { tone: "hi" }, { owner: "ftp.body" });
    line("plumbing", "plumbing.igniter1", [pump.face, ringAt(250, 27, 401, FTP_C), ringAt(250, 27, 336, FTP_C), ringAt(250, 18, 336, FTP_C)], 1.2, { free: [true, true] });
  }
  // jacket lines: cooling methane out of the chamber jacket, through a ball tee, to the fuel-rich preburner
  {
    const s = THROAT.s;
    const z = ez(s);
    const TJ = ringAt(265, 46, z);
    const tee = 3.2;
    ball("plumbing", "plumbing.jacket.tee", TJ, tee, { tone: "hi" });
    const onBall = (from) => G.add3(TJ, G.mul3(G.unit3(G.sub3(from, TJ)), Math.sqrt(tee * tee - 1.4 * 1.4)));
    for (const [i, deg] of [250, 280].entries()) {
      const b = boss("chamber", `chamber.jacketport${i}`, bandAt(s), deg, z, 2.4, 27.8, { owner: CHAMBER_BODY });
      const knee = ringAt(deg, 37, z);
      line("plumbing", `plumbing.jacket${i}`, [b.face, knee, onBall(knee)], 1.4, { flanges: [true, false], free: [true, false] });
    }
    const pb = boss("ftp", "ftp.jacketport", HOST.ftpPb, 225, 320, 2.4, 17, { c: FTP_C, owner: "ftp.body" });
    const near = ringAt(225, 25, 320, FTP_C);
    line("plumbing", "plumbing.jacket.out", [onBall(near), near, pb.face], 1.4, { flanges: [false, true], free: [false, true] });
  }
  // oxygen tapped from the pump to the fuel-rich preburner
  {
    const b = otpBoss(300);
    const knee = ringAt(300, 56, 438);
    const low = ringAt(300, 56, 340);
    const dir = Math.atan2(low[1] - FTP_C[1], low[0] - FTP_C[0]) * (180 / Math.PI);
    const pb = boss("ftp", "ftp.oxport", HOST.ftpPb, dir, 340, 2.4, 17, { c: FTP_C, owner: "ftp.body" });
    line("plumbing", "plumbing.oxfeed", [b.face, knee, low, pb.face], 1.3, { free: [true, true] });
  }
}

// ---- 08 the methane unit's balance line, pump to turbine on its open side
{
  const a = boss("ftp", "ftp.balance.pump", HOST.ftpPump, 330, 401, 2.2, 21.4, { c: FTP_C, owner: "ftp.body" });
  const b = boss("ftp", "ftp.balance.turbine", HOST.ftpTurbine, 330, 380, 2.2, 21.4, { c: FTP_C, owner: "ftp.body" });
  line("ftp", "ftp.balance", [a.face, ringAt(330, 26, 401, FTP_C), ringAt(330, 26, 380, FTP_C), b.face], 1, { list: [] });
}

// ---- the stand's pressurisation cable, from the junction box up to the beam
{
  const start = cb(48, JB.v1, 339);
  const v = BEAM_SIDE;
  const riser = G.add3(G.mul3(BEAM_DIR, -75), G.mul3(v, 25));
  const end = G.add3(G.add3(G.mul3(BEAM_DIR, -75), G.mul3(v, BEAM_HALF)), [0, 0, 531]);
  cable("stand", "stand.press.cable", [start, cb(48, JB.v1 + 6, 339), [riser[0], riser[1], 339], [riser[0], riser[1], 531], end], 0.7, { shells: [true, false], free: [true, false], list: null, bend: 6 });
}

// ================================================================= settle, emit and write the page
A.settle(R, P);
R.items.sort((a, b) => a.key - b.key);

const LINE = {
  gimbal: `gimbal · carries ${FACT.thrustTf} tf into the stand and steers`,
  otp: "oxygen pump · every drop of LOX through its own turbine",
  orpb: "oxygen-rich preburner · burns a little methane in all the LOX",
  lox: "oxygen duct · the main valve meters LOX to the preburner",
  controller: `controller · ${LINES.cables.length} cables to exciters, valves and a pickup`,
  chamber: `main chamber · ${FACT.chamberBar} bar, no igniter of its own`,
  hotgas: "hot-gas manifold · fuel-rich gas into the injector",
  ftp: "methane pump · driven by the fuel-rich preburner",
  downcomer: "downcomer · methane down to the nozzle manifold",
  plumbing: `plumbing · ${LINES.sense.length} sense lines · ${LINES.small.length} other lines`,
  nozzle: `nozzle · ${FACT.exitM} m exit, cooled by the methane`,
};
const COLD = `${FACT.dryKg.toLocaleString("en-US")} kg · cold`;
const r3 = (v) => Math.round(v * 1000) / 1000;
const emitted = R.items.map((item, index) => {
  const ride = item.ride && item.ride !== item.piece ? ` data-ride="${item.ride}"` : "";
  const m = item.move.map((v) => r3(v)).join(",");
  return `<g class="it" data-piece="${item.piece}"${ride} data-k="${r3(item.key)}" data-m="${m}" data-i="${index}">${item.svg}</g>`;
});

const LABEL = "A Raptor 2 rocket engine hung nozzle-down in a vertical test stand: a square deck on short feet with a flame cone and deluge ring, two columns with a ladder and a cable tray, and a beam carrying the crosshead and load cell. Below the gimbal sit the oxygen turbopump, the oxygen-rich preburner, the injector and main chamber and the bell nozzle with its cooling manifold; the methane turbopump hangs alongside on struts, joined by the hot-gas manifold and the downcomer, with the oxygen duct, the controller and its harness, and the sense and purge lines around them.";
const backSvg = k.figureSvg({ width: W, height: H, label: LABEL, body: back, className: "rp-back" });
const svgOpen = (cls) => `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg ${cls}" viewBox="0 0 ${W} ${H}" aria-hidden="true">`;
const frontSvg = `${svgOpen("rp-front")}<g class="rp-engine">${emitted.join("")}</g></svg>`;
const lip = G.arcOf(ENGINE, -1.6, bell(0) + 2.6, P);
const glowSvg = `${svgOpen("rp-glow")}<g class="rp-glow-g"><path class="rp-rim rp-rim-soft" d="${lip}"/><path class="rp-rim" d="${lip}"/></g></svg>`;
const flashAt = at([0, 0, Z0 - 10]);
const cameraOf = k.cameraOf(P);
const DATA = {
  W,
  H,
  camera: glCamera(P),
  cam: { sinA: r3(cameraOf.sinA), cosA: r3(cameraOf.cosA), sinE: r3(cameraOf.sinE), cosE: r3(cameraOf.cosE), k: Math.round(cameraOf.k * 1e5) / 1e5 },
  view: V.map((v) => Math.round(v * 1e5) / 1e5),
  stagger: STAGGER,
  spring: SPRING,
  parts: ASSEMBLIES.map((a) => ({ id: a.id, name: a.name, line: LINE[a.id] })),
  cold: COLD,
  facts: { chamberBar: FACT.chamberBar, thrustTf: FACT.thrustTf, backTf: Math.round(BACK_TF * 100) / 100 },
  flash: [Math.round((flashAt[0] / W) * 1000) / 10, Math.round((flashAt[1] / H) * 1000) / 10],
  gl: { exitZ: Z0, exitR: bell(0), deckHalf: DECK.w / 2, deckR: DECK.r, plateR: CONE.plate, plateH: CONE.plateH, coneR: CONE.r, coneH: CONE.h, torusR: DELUGE.R, torusTube: DELUGE.r, torusZ: DELUGE.r + DELUGE.lift, col: COL, colHalf: COL_HALF, colTop: BEAM_Z[0] },
};

const CSS = readFileSync(join(HERE, "raptor.css"), "utf8");
const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", () => JSON.stringify(DATA));
const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const parts = ASSEMBLIES.map((a, i) => `<button class="rp-part" type="button" data-part="${a.id}"><span class="rp-num">${String(i + 1).padStart(2, "0")}</span>${esc(a.name)}</button>`).join("");
const minus = (v) => String(v).replace("-", "−");
const CAPTION = `Raptor 2 runs the full-flow staged-combustion cycle on liquid oxygen at ${minus(FACT.loxC)} °C and methane at ${minus(FACT.ch4C)} °C, mixed ${FACT.mixture} : 1 by mass. All of the oxygen passes through an oxygen-rich preburner that spins the oxygen turbopump, and all of the methane, after cooling the nozzle and chamber, through a fuel-rich preburner that spins the methane turbopump. The two hot gases meet in the main chamber at ${FACT.chamberBar} bar and light each other, so the chamber has no igniter. The engine makes ${FACT.thrustTf} tf at sea level for a dry mass of ${FACT.dryKg.toLocaleString("en-US")} kg, and the load cell above the gimbal reads that thrust into the stand.`;
const STAGE_LABEL = "Raptor 2 in its test stand. Hover a part, or use the arrow keys, Home and End, to take the engine apart and pick out an assembly; Space toggles apart. Press I or the Ignite button to fire it, and Escape to shut down and close it up.";
const pdf = existsSync(join(HERE, "raptor-engine-poster-a4.pdf")) ? pdfButton("raptor-engine-poster-a4.pdf") : "";
const body = `<style>${CSS}</style><figure class="iso-figure rp"><div class="iso-plate">${pdf}<div class="iso-plate-corners" aria-hidden="true"><span class="iso-plate-corner" data-corner="fig">Fig 1</span><span class="iso-plate-corner" data-corner="title">Raptor 2 · test stand</span><span class="iso-plate-corner" data-corner="readout" data-readout>${esc(COLD)}</span></div><div class="rp-stage" tabindex="0" role="slider" aria-label="${esc(STAGE_LABEL)}" aria-valuemin="0" aria-valuemax="${ASSEMBLIES.length}" aria-valuenow="0" aria-valuetext="Assembled, cold">${backSvg}<canvas class="rp-plume" aria-hidden="true"></canvas>${frontSvg}${glowSvg}<canvas class="rp-veil" aria-hidden="true"></canvas><div class="rp-flash" aria-hidden="true"></div></div><div class="rp-controls"><button class="rp-fire" type="button" data-fire><span class="rp-lamp" aria-hidden="true"></span><span data-fire-label>Ignite</span></button><span class="rp-hint">Hover the engine to take it apart</span><span class="rp-live" aria-live="polite" data-live></span></div></div><figcaption class="iso-legend"><span class="rp-parts">${parts}</span><span class="iso-caption">${esc(CAPTION)}</span></figcaption></figure>`;
const page = k.pageHtml({ title: "Raptor 2", theme: THEME, body, script: glScript() + LIVE, width: 980 });
const file = THEME === "light" ? "raptor-engine-light.html" : "raptor-engine.html";
writeFileSync(join(HERE, file), page);
console.log(`wrote ${file} · ${(page.length / 1024).toFixed(0)} KB · ${R.items.length} items · ${R.solids.length} solids · ${R.tubes.length} tubes`);

A.auditOrExit(R, P, { crowd: [] });
