// Every static part of the rig, computed once. Moving parts are built at their home position
// (carriage at lean 0, probe and rider at HOME, finger lifted) and moved with `shift` by the live layer.
import {
  corners,
  cylinder as kitCylinder,
  depthOf,
  haloOf,
  insetPlan,
  knurl as kitKnurl,
  lineOnTop,
  planOutline,
  radialTicks,
  ring,
  segment,
  sideArc as kitSideArc,
  sideRing,
  sideTicks,
  slabOf,
  topMatrix,
  topTicks,
  type Flat,
  type Plan,
  type Plane,
  type SolidPaths,
  type Ticks,
} from "../../kit/iso-kit";
import { HALF } from "./rig";
import {
  at,
  BASE,
  BASE_Z,
  BEAM,
  BEAM_BOTTOM,
  BEAM_TOP,
  CARRIAGE,
  CARRIAGE_TOP,
  CARRIAGE_Z,
  COIL,
  DIAL,
  FLOOR_TOP,
  FOOT_Z,
  FRAME,
  GLASS_TOP,
  HOME,
  LIFT,
  needleAngle,
  P,
  PLUNGER_Z,
  POST_X,
  RAIL_Y,
  ROD_R,
  ROD_Y,
  ROD_Z,
  STOP_TOP,
} from "./view";

// ---- helpers over the kit, bound to this figure's projection ----

export const solid = (plan: Plan, z: number, h: number, steps = 4, bevel = 0): SolidPaths => slabOf(plan, z, h, P, steps, bevel);
export const cylinder = (cx: number, cy: number, r: number, z: number, h: number, steps = 28, bevel = 0): SolidPaths =>
  kitCylinder(cx, cy, r, z, h, P, steps, bevel);
export const knurl = (cx: number, cy: number, r: number, z0: number, z1: number, count: number, inset = 0.4) => kitKnurl(cx, cy, r, z0, z1, count, P, inset);
export const sideArc = (cx: number, cy: number, r: number, z: number, steps = 24) => kitSideArc(cx, cy, r, z, P, steps);
export const faceRing = (cx: number, cy: number, r: number, z: number, steps = 40) => ring(cx, cy, r, z, P, steps);
export const topRuler = (from: number, to: number, step: number, every: number, edge: number, z: number, lengths: [number, number], axis: "x" | "y" = "x"): Ticks =>
  topTicks(from, to, step, every, edge, z, lengths, P, axis);
export const faceRuler = (from: number, to: number, step: number, every: number, face: number, top: number, lengths: [number, number]): Ticks =>
  sideTicks(from, to, step, every, face, top, lengths, P);

const byDepth = (points: Plane[]) => [...points].sort((a, b) => depthOf([a[0], a[1], 0], P) - depthOf([b[0], b[1], 0], P));
const screwHeads = (points: Plane[], z: number, radius = 1.6) => ({
  rings: points.map(([x, y]) => faceRing(x, y, radius, z, 16)).join(""),
  dots: points.map(([x, y]) => at([x, y, z])),
});

export interface Screws {
  rings: string;
  dots: Flat[];
}

// ---- 1. base ----

const LABEL: Plan = { x: -127, y: 24, w: 19, d: 13, r: 1.2 };

export const BASE_ART = {
  halo: haloOf(BASE, FOOT_Z, 12, P),
  feet: byDepth(corners(BASE, 22)).map(([x, y]) => ({
    flange: cylinder(x, y, 7, FOOT_Z, 1.6),
    foot: cylinder(x, y, 5.4, FOOT_Z + 1.6, BASE_Z - FOOT_Z - 1.6),
  })),
  slab: solid(BASE, BASE_Z, -BASE_Z, 8, 1.6),
  groove: planOutline(insetPlan(BASE, 5), 0, P),
  screws: screwHeads(corners(BASE, 10), 0, 2.2),
  label: solid(LABEL, 0, 0.8, 4),
  labelInset: planOutline(insetPlan(LABEL, 1.6), 0.8, P, 4),
  labelRules: [0.32, 0.55, 0.76].map((share, index) =>
    lineOnTop([LABEL.x + 3.4, LABEL.y + LABEL.d * share], [LABEL.x + LABEL.w - (index === 1 ? 7.5 : 4.5), LABEL.y + LABEL.d * share], 0.8, P),
  ),
  labelScrews: [at([LABEL.x + LABEL.w - 2.6, LABEL.y + 2.6, 0.8]), at([LABEL.x + LABEL.w - 2.6, LABEL.y + LABEL.d - 2.6, 0.8])],
};

// ---- 2. rail, rider and probe block ----

const BEAM_FACE = BEAM.y + BEAM.d;
const stopPlan = (x: number): Plan => ({ x, y: BEAM.y - 1, w: 5, d: BEAM.d + 2, r: 1 });

export const RAIL_ART = {
  posts: [-POST_X, POST_X].map((x) => ({
    foot: cylinder(x, RAIL_Y, 7, 0, 2.5, 28),
    post: cylinder(x, RAIL_Y, 3.6, 2.5, BEAM_BOTTOM - 2.5, 24),
    seams: sideArc(x, RAIL_Y, 3.6, 8) + sideArc(x, RAIL_Y, 3.6, BEAM_BOTTOM - 5),
  })),
  beam: solid(BEAM, BEAM_BOTTOM, BEAM_TOP - BEAM_BOTTOM, 3, 0.6),
  ruler: faceRuler(-100, 100, 5, 5, BEAM_FACE, BEAM_TOP, [1.8, 3.4]),
  stops: [stopPlan(-117), stopPlan(112)].map((plan) => solid(plan, BEAM_TOP, STOP_TOP - BEAM_TOP, 3)),
  stopScrews: [-114.5, 114.5].map((x) => at([x, RAIL_Y, STOP_TOP])),
  beamScrews: screwHeads([[-POST_X, RAIL_Y], [POST_X, RAIL_Y]], BEAM_TOP, 1.5),
};

export const RIDER_ART = {
  tab: solid({ x: HOME - 2, y: BEAM_FACE, w: 4, d: 1.6, r: 0.5 }, BEAM_BOTTOM + 0.5, 4, 2),
  mark: segment([HOME, BEAM_FACE + 1.6, BEAM_BOTTOM + 0.5], [HOME, BEAM_FACE + 1.6, BEAM_BOTTOM + 4.5], P),
};

const BLOCK: Plan = { x: HOME - 8, y: BEAM.y - 2, w: 16, d: BEAM.d + 3, r: 1.5 };
const BLOCK_TOP = BEAM_TOP + 8;
const KNOB: Plane = [HOME, BLOCK.y + 5.5];

export const PROBE_ART = {
  block: solid(BLOCK, BEAM_TOP, BLOCK_TOP - BEAM_TOP, 3, 0.5),
  index: segment([HOME, BLOCK.y + BLOCK.d, BLOCK_TOP], [HOME, BLOCK.y + BLOCK.d, BEAM_TOP], P),
  neck: solid({ x: KNOB[0] - 1.6, y: KNOB[1] - 1.6, w: 3.2, d: 3.2, r: 1 }, BLOCK_TOP, 1.4, 3),
  knob: cylinder(KNOB[0], KNOB[1], 3.6, BLOCK_TOP + 1.4, 3.6, 28),
  knurl: knurl(KNOB[0], KNOB[1], 3.6, BLOCK_TOP + 1.4, BLOCK_TOP + 5, 30, 0.5),
  pointer: lineOnTop([KNOB[0] - 2, KNOB[1]], [KNOB[0] + 3.6, KNOB[1]], BLOCK_TOP + 5, P),
};

// ---- 3. back of the frame: floor with its grid, back bar, left bar ----

const FLOOR: Plan = { x: -FRAME.inner, y: FRAME.back + FRAME.bar, w: FRAME.inner * 2, d: (FRAME.front - FRAME.bar) * 2, r: 0 };
const sideBar = (y: number): Plan => ({ x: -FRAME.inner, y, w: FRAME.inner * 2, d: FRAME.bar, r: 0.8 });
const endBar = (x: number): Plan => ({ x, y: FRAME.back, w: FRAME.bar, d: FRAME.front - FRAME.back, r: 0.8 });

const gridLines: string[] = [];
for (let x = -80; x <= 80; x += 20) gridLines.push(lineOnTop([x, FLOOR.y], [x, FLOOR.y + FLOOR.d], FLOOR_TOP, P));
for (const y of [-14, 0, 14]) gridLines.push(lineOnTop([FLOOR.x, y], [FLOOR.x + FLOOR.w, y], FLOOR_TOP, P));

export const BACK_FRAME_ART = {
  floor: solid(FLOOR, 0, FLOOR_TOP, 1),
  grid: gridLines.join(""),
  left: solid(endBar(-FRAME.outer), 0, FRAME.endTop, 2, 0.5),
  leftScrews: screwHeads([[-FRAME.outer + 3, -26], [-FRAME.outer + 3, 26]], FRAME.endTop, 1.4),
  /** Spring seats on the left bar's inner face, where the left coils start. */
  seats: [-ROD_Y, ROD_Y].map((y) => sideRing([-FRAME.inner, y, ROD_Z], COIL.radius, "x", P, 24)).join(""),
  back: solid(sideBar(FRAME.back), 0, FRAME.sideTop, 2, 0.5),
  backScrews: screwHeads([[-80, FRAME.back + 3], [80, FRAME.back + 3]], FRAME.sideTop, 1.3),
};

// ---- 5. the guide rods ----

export const RODS_ART = [-ROD_Y, ROD_Y].map((y) => solid({ x: -FRAME.inner, y: y - ROD_R, w: FRAME.inner * 2, d: ROD_R * 2, r: 1.8 }, ROD_Z - ROD_R, ROD_R * 2, 3));

// ---- 7. the carriage (moves along x with the lean) ----

const BUSHING_W = 12;
const bushing = (side: number, y: number): Plan => ({
  x: side > 0 ? CARRIAGE.x + CARRIAGE.w - BUSHING_W : CARRIAGE.x,
  y: y - 6,
  w: BUSHING_W,
  d: 12,
  r: 2,
});
const bushingSpots = byDepth([
  [-1, -ROD_Y],
  [1, -ROD_Y],
  [-1, ROD_Y],
  [1, ROD_Y],
]);
const SEAT: Plan = { x: -HALF[0] - 2, y: -HALF[1] - 2, w: HALF[0] * 2 + 4, d: HALF[1] * 2 + 4, r: HALF[1] + 2 };
const CONTACT: Plan = { x: CARRIAGE.x + CARRIAGE.w, y: -6, w: 7, d: 12, r: 1.5 };

export const CARRIAGE_ART = {
  shadow: haloOf(insetPlan(CARRIAGE, -2), FLOOR_TOP, CARRIAGE_TOP - FLOOR_TOP, P),
  bushings: bushingSpots.map(([side, y]) => solid(bushing(side, y), 3, CARRIAGE_Z - 3, 3)),
  plate: solid(CARRIAGE, CARRIAGE_Z, CARRIAGE_TOP - CARRIAGE_Z, 4, 0.6),
  seat: planOutline(SEAT, CARRIAGE_TOP, P, 10),
  plateScrews: screwHeads(
    [-1, 1].flatMap((side) => [-ROD_Y, ROD_Y].map((y) => [side * (CARRIAGE.x + CARRIAGE.w - BUSHING_W / 2), y] as Plane)),
    CARRIAGE_TOP,
    1.2,
  ),
  rivets: Array.from({ length: 13 }, (_, index) => at([-60 + index * 10, CARRIAGE.y + CARRIAGE.d - 1.6, CARRIAGE_TOP])),
  contact: solid(CONTACT, PLUNGER_Z - 3, CARRIAGE_TOP - PLUNGER_Z + 3, 3, 0.4),
  /** Spring seats on the right bushings' end faces. */
  seats: [-ROD_Y, ROD_Y].map((y) => sideRing([COIL.end, y, ROD_Z], COIL.radius, "x", P, 24)).join(""),
};

// ---- 12. the plunger (rides with the carriage) ----

const PLUNGER_START = CONTACT.x + CONTACT.w;
export const PLUNGER_ART = {
  rod: solid({ x: PLUNGER_START, y: -1.6, w: 40, d: 3.2, r: 1.4 }, PLUNGER_Z - 1.6, 3.2, 3),
  collar: solid({ x: PLUNGER_START + 3, y: -2.8, w: 3, d: 5.6, r: 1.4 }, PLUNGER_Z - 2.8, 5.6, 3),
};

// ---- 14. front of the frame: front bar with its ruler, right bar with the rod bores ----

const FRONT_EDGE = FRAME.front - FRAME.bar + 0.3;

export const FRONT_FRAME_ART = {
  front: solid(sideBar(FRAME.front - FRAME.bar), 0, FRAME.sideTop, 2, 0.5),
  ruler: topRuler(-40, 40, 2, 5, FRONT_EDGE, FRAME.sideTop, [1.4, 2.6]),
  zero: lineOnTop([0, FRONT_EDGE], [0, FRAME.front - 0.6], FRAME.sideTop, P),
  frontScrews: screwHeads([[-80, FRAME.front - 3], [80, FRAME.front - 3]], FRAME.sideTop, 1.3),
  right: solid(endBar(FRAME.inner), 0, FRAME.endTop, 2, 0.5),
  bores: [-ROD_Y, ROD_Y].map((y) => sideRing([FRAME.outer, y, ROD_Z], ROD_R + 1.1, "x", P)).join(""),
  rodEnds: [-ROD_Y, ROD_Y].map((y) => sideRing([FRAME.outer, y, ROD_Z], ROD_R, "x", P)).join(""),
  rightScrews: screwHeads([[FRAME.inner + 3, -26], [FRAME.inner + 3, 26]], FRAME.endTop, 1.4),
};

// ---- 15. the dial gauge ----

const STAND: Plan = { x: DIAL.x - 14, y: -12, w: 28, d: 24, r: 2 };
const FACE_R = DIAL.radius;
const dialPoint = (angle: number, radius: number, z: number) => at([DIAL.x + Math.sin(angle) * radius, DIAL.y - Math.cos(angle) * radius, z]);

export const DIAL_ART = {
  stand: solid(STAND, 0, DIAL.z, 3, 0.5),
  standScrews: screwHeads(corners(STAND, 3), DIAL.z, 1.2),
  clamp: solid({ x: FRAME.outer, y: -5.5, w: 5, d: 11, r: 1.2 }, PLUNGER_Z - 5, 10, 3, 0.4),
  clampScrew: at([FRAME.outer + 2.5, 0, PLUNGER_Z + 5]),
  sleeve: solid({ x: FRAME.outer + 5, y: -3.4, w: 6, d: 6.8, r: 2.6 }, PLUNGER_Z - 3.4, 6.8, 3),
  lug: solid({ x: DIAL.x - FACE_R - 2, y: -5, w: 4.5, d: 10, r: 1.2 }, PLUNGER_Z - 5, 10, 3, 0.4),
  puck: cylinder(DIAL.x, DIAL.y, FACE_R, DIAL.z, DIAL.top - DIAL.z, 64, 0.8),
  band: knurl(DIAL.x, DIAL.y, FACE_R, DIAL.top - 3.4, DIAL.top, 84, 0.3),
  bandSeam: sideArc(DIAL.x, DIAL.y, FACE_R, DIAL.top - 3.4, 40),
  bezel: faceRing(DIAL.x, DIAL.y, FACE_R - 1.4, DIAL.top, 64),
  face: faceRing(DIAL.x, DIAL.y, FACE_R - 5.4, DIAL.top, 56),
  ticks: radialTicks(DIAL.x, DIAL.y, FACE_R - 2.2, 20, 5, DIAL.top, [1.3, 2.6], P),
  give: [needleAngle(14), needleAngle(-14)].map((angle) => dialPoint(angle, FACE_R - 6.6, DIAL.top)),
  unit: topMatrix([DIAL.x, DIAL.y + 6.2], DIAL.top, P),
  crownStem: solid({ x: DIAL.x + FACE_R - 0.5, y: -1.5, w: 4.5, d: 3, r: 0.8 }, PLUNGER_Z - 1.5, 3, 2),
  crown: solid({ x: DIAL.x + FACE_R + 4, y: -3.6, w: 3.2, d: 7.2, r: 1.6 }, PLUNGER_Z - 3.3, 6.6, 6),
  hub: faceRing(DIAL.x, DIAL.y, 1.5, DIAL.top + 0.3, 16),
  hubDot: at([DIAL.x, DIAL.y, DIAL.top + 0.3]),
};

// ---- 16. the finger: pad, stem and collar, built lifted at HOME ----

const STEM_TOP = 44;
export const FINGER_ART = {
  pad: cylinder(HOME, 0, 4.6, GLASS_TOP + LIFT, 2, 28, 0.4),
  stem: cylinder(HOME, 0, 1.9, GLASS_TOP + 2 + LIFT, STEM_TOP - GLASS_TOP - 2, 20),
  collar: cylinder(HOME, 0, 2.8, 25 + LIFT, 2, 20),
};

// ---- 17. the arm and the probe housing ----

const HOUSING_Z = 40;
const HOUSING_TOP = 58;
export const ARM_ART = {
  arm: solid({ x: HOME - 3, y: BLOCK.y + BLOCK.d, w: 6, d: -(BLOCK.y + BLOCK.d) - 4.5, r: 1.5 }, BEAM_TOP, 4, 3, 0.4),
  collar: cylinder(HOME, 0, 6.4, HOUSING_Z - 3, 3, 32),
  housing: cylinder(HOME, 0, 5.5, HOUSING_Z, HOUSING_TOP - HOUSING_Z, 32, 0.4),
  seams: sideArc(HOME, 0, 5.5, 46) + sideArc(HOME, 0, 5.5, 52),
  cap: cylinder(HOME, 0, 4.4, HOUSING_TOP, 2.4, 28),
  lockNeck: solid({ x: HOME - 1.2, y: 5, w: 2.4, d: 3, r: 0.6 }, 47.6, 2.4, 2),
  lockHead: solid({ x: HOME - 2.2, y: 8, w: 4.4, d: 1.8, r: 0.8 }, 46.6, 4.4, 3),
};

/** Where the glass rests: the dotted outline the live layer fades in as it moves. */
export const REST_OUTLINE = planOutline({ x: -HALF[0], y: -HALF[1], w: HALF[0] * 2, d: HALF[1] * 2, r: HALF[1] }, GLASS_TOP, P, 10);
