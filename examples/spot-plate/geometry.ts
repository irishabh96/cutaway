// Camera, layout and every static part of the spot plate, computed once.
// World units are px of the drops; z is up. The tray of wells is on the left (−x),
// the deck with the feeler fan and the dropper bottle on the right.
import {
  boxCorners,
  corners,
  cylinder,
  depthOf,
  fitProjection,
  haloOf,
  insetPlan,
  iso,
  knurl,
  lineOnTop,
  onTop,
  pathOf,
  planOutline,
  ringOf,
  segment,
  sideArc,
  slabOf,
  topMatrix,
  topTicks,
  towardViewer,
  extrude,
  type Flat,
  type Plan,
  type Plane,
  type Point3,
  type Projection,
  type Ticks,
} from "../../kit/iso-kit";
import { angleOf, BIG, GAPS, MERGE_MAX, SMALL } from "./rig";

export const WIDTH = 600;
export const HEIGHT = 340;
export const AZIMUTH = 50;
const SIDE_PAD = 80;
const END_PAD = 34;

// ---- layout ----

export const TRAY_TOP = 14;
export const WELL_DEPTH = 2.2;
export const FLOOR_Z = TRAY_TOP - WELL_DEPTH;
export const GLASS_H = 6;
/** Space between a drop and its channel wall. */
const MARGIN = 6;
const CHANNEL = 2 * BIG + 2 * MARGIN;
/** The rim in front of each channel that carries its ruler. */
const RIM = 15;
const EDGE = 13;
const GROUP_GAP = 16;
const lengthOf = (gap: number) => 2 * MARGIN + 2 * BIG + gap + 2 * SMALL;
const GROUP_LENGTH = [Math.max(...GAPS.slice(0, 3).map(lengthOf)), Math.max(...GAPS.slice(3).map(lengthOf))];

export const TRAY: Plan = { x: -340, y: -138, w: EDGE * 2 + GROUP_LENGTH[0]! + GROUP_GAP + GROUP_LENGTH[1]!, d: EDGE + 3 * (CHANNEL + RIM) + 2, r: 10 };
export const DECK_TOP = 8;
export const DECK: Plan = { x: TRAY.x + TRAY.w + 16, y: -130, w: 156, d: 260, r: 10 };
export const BASE: Plan = { x: TRAY.x - 16, y: -154, w: DECK.x + DECK.w + 16 - (TRAY.x - 16), d: 308, r: 12 };
const BASE_Z = -12;
const FOOT_Z = -17;

export interface Well {
  index: number;
  gap: number;
  /** The channel's opening, in plan. */
  plan: Plan;
  /** Centres of the big and the small drop. */
  big: Plane;
  small: Plane;
  /** x of the datum: the big drop's near edge, where the ruler starts. */
  datum: number;
}

export const WELLS: Well[] = GAPS.map((gap, index) => {
  const group = index < 3 ? 0 : 1;
  const row = index % 3;
  const x = TRAY.x + EDGE + (group ? GROUP_LENGTH[0]! + GROUP_GAP : 0);
  const y = TRAY.y + EDGE + row * (CHANNEL + RIM);
  const mid = y + CHANNEL / 2;
  return {
    index,
    gap,
    plan: { x, y, w: lengthOf(gap), d: CHANNEL, r: 22 },
    big: [x + MARGIN + BIG, mid],
    small: [x + MARGIN + 2 * BIG + gap + SMALL, mid],
    datum: x + MARGIN + 2 * BIG,
  };
});

/** The fan: a pivot near the deck's left edge, seven blades stacked on a washer. */
export const PIVOT: Plane = [DECK.x + 24, 0];
export const WASHER_TOP = DECK_TOP + 2;
export const BLADE_WIDTH = 12;
export const BLADE_BUTT = 13;
export const BLADE_TIP = 84;
export const MERGE_TIP = 99;
export const BLADE_THICK = GAPS.map((gap) => 0.7 + gap * 0.025);
/** Bottom of each gap blade, then of the merge blade on top. */
export const BLADE_Z: number[] = [];
{
  let z = WASHER_TOP;
  for (const thick of BLADE_THICK) {
    BLADE_Z.push(z);
    z += thick;
  }
  BLADE_Z.push(z);
}
export const MERGE_THICK = 1.6;
export const STACK_TOP = BLADE_Z[BLADE_Z.length - 1]! + MERGE_THICK;

/** The protractor band round the pivot, 0 to 48 px over half a turn. */
const BAND_IN = 92;
const BAND_OUT = 106;
const BAND_H = 4;
const BAND_TOP = DECK_TOP + BAND_H;
const GUIDE_R = 88;
const PIN_R = 76;
/** Where the band's far piece meets its near piece: the arc turns to face the viewer here. */
export const SEAM = (AZIMUTH * Math.PI) / 180;

const BOTTLE: Plane = [DECK.x + DECK.w - 26, DECK.y + 26];
const BULB_TOP = 73;

// ---- camera ----

const fitted = fitProjection(
  [...boxCorners(BASE, FOOT_Z, 0), [PIVOT[0], PIVOT[1], STACK_TOP + 9], [BOTTLE[0], BOTTLE[1], BULB_TOP]],
  WIDTH - 2 * (SIDE_PAD - END_PAD),
  HEIGHT,
  { pad: END_PAD, azimuth: AZIMUTH },
);
export const P: Projection = { ...fitted, origin: [fitted.origin[0] + SIDE_PAD - END_PAD, fitted.origin[1]] };

export const at = (point: Point3) => iso(point, P);
export const VIEW = towardViewer(P);

/** A direction across the protractor: 0 points to −y (the back), half a turn later to +y. */
export const ray = (angle: number, radius: number, from: Plane = PIVOT): Plane => [from[0] + Math.sin(angle) * radius, from[1] - Math.cos(angle) * radius];

const byDepth = <T>(items: T[], spot: (item: T) => Plane) =>
  [...items].sort((a, b) => depthOf([spot(a)[0], spot(a)[1], 0], P) - depthOf([spot(b)[0], spot(b)[1], 0], P));

export interface Screws {
  rings: string;
  dots: Flat[];
}

const screwsAt = (points: Plane[], z: number, radius = 2): Screws => ({
  rings: points.map(([x, y]) => onTop(ringOf({ x: x - radius, y: y - radius, w: radius * 2, d: radius * 2, r: radius }, 4), z, P, true)).join(""),
  dots: points.map(([x, y]) => at([x, y, z])),
});

// ---- small plane geometry for the wells (screen space) ----

const cross = (o: Flat, a: Flat, b: Flat) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const areaOf = (points: Flat[]) => points.reduce((sum, point, index) => {
  const next = points[(index + 1) % points.length]!;
  return sum + point[0] * next[1] - next[0] * point[1];
}, 0);

/** Clip a polygon by a convex one (Sutherland–Hodgman). */
function clipPolygon(subject: Flat[], hull: Flat[]): Flat[] {
  const sign = Math.sign(areaOf(hull)) || 1;
  let out = subject;
  for (let index = 0; index < hull.length && out.length; index++) {
    const a = hull[index]!;
    const b = hull[(index + 1) % hull.length]!;
    const inside = (p: Flat) => cross(a, b, p) * sign >= 0;
    const meet = (p: Flat, q: Flat): Flat => {
      const pa = cross(a, b, p);
      const qa = cross(a, b, q);
      const t = pa / (pa - qa);
      return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    };
    const input = out;
    out = [];
    for (let k = 0; k < input.length; k++) {
      const p = input[k]!;
      const q = input[(k + 1) % input.length]!;
      if (inside(q)) {
        if (!inside(p)) out.push(meet(p, q));
        out.push(q);
      } else if (inside(p)) out.push(meet(p, q));
    }
  }
  return out;
}

/** The parts of a polyline inside a convex polygon. */
function clipPolyline(line: Flat[], hull: Flat[]): Flat[][] {
  const sign = Math.sign(areaOf(hull)) || 1;
  const pieces: Flat[][] = [];
  let run: Flat[] = [];
  for (let index = 0; index + 1 < line.length; index++) {
    const p = line[index]!;
    const q = line[index + 1]!;
    let t0 = 0;
    let t1 = 1;
    for (let edge = 0; edge < hull.length && t0 <= t1; edge++) {
      const a = hull[edge]!;
      const b = hull[(edge + 1) % hull.length]!;
      const fp = cross(a, b, p) * sign;
      const fq = cross(a, b, q) * sign;
      if (fp < 0 && fq < 0) t1 = -1;
      else if (fp < 0) t0 = Math.max(t0, fp / (fp - fq));
      else if (fq < 0) t1 = Math.min(t1, fp / (fp - fq));
    }
    if (t0 > t1) {
      if (run.length > 1) pieces.push(run);
      run = [];
      continue;
    }
    const from: Flat = [p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0];
    const to: Flat = [p[0] + (q[0] - p[0]) * t1, p[1] + (q[1] - p[1]) * t1];
    if (!run.length || t0 > 1e-6) {
      if (run.length > 1) pieces.push(run);
      run = [from];
    }
    run.push(to);
    if (t1 < 1 - 1e-6) {
      pieces.push(run);
      run = [];
    }
  }
  if (run.length > 1) pieces.push(run);
  return pieces;
}

// ---- 1. the bench base ----

export const BASE_ART = {
  halo: haloOf(BASE, FOOT_Z, 12, P),
  feet: byDepth(corners(BASE, 26), (spot) => spot).map(([x, y]) => ({
    flange: cylinder(x, y, 8, FOOT_Z, 1.8, P, 28),
    foot: cylinder(x, y, 6, FOOT_Z + 1.8, BASE_Z - FOOT_Z - 1.8, P, 28),
  })),
  slab: slabOf(BASE, BASE_Z, -BASE_Z, P, 8, 1.6),
  groove: planOutline(insetPlan(BASE, 5), 0, P),
  inlay: planOutline(insetPlan(BASE, 8.5), 0, P),
  screws: screwsAt(corners(BASE, 11), 0, 2.2),
};

// ---- 2. the tray and its six wells ----

function wellArt(well: Well) {
  const ring = ringOf(well.plan, 8);
  const rim = ring.map(([x, y]) => at([x, y, TRAY_TOP]));
  const floor = ring.map(([x, y]) => at([x, y, FLOOR_Z]));
  // The floor's far run meets the back wall: its foot line, where the wall lets you see it.
  const count = ring.length;
  const area = ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % count]!;
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0);
  const far = ring.map((point, index) => {
    const next = ring[(index + 1) % count]!;
    const dx = next[0] - point[0];
    const dy = next[1] - point[1];
    const normal = area > 0 ? [dy, -dx] : [-dy, dx];
    // The wall's inside faces the viewer where the opening's outward normal faces away.
    return normal[0]! * VIEW[0] + normal[1]! * VIEW[1] < 0;
  });
  const start = far.findIndex((flag, index) => flag && !far[(index + count - 1) % count]);
  const foot: Flat[] = [];
  if (start >= 0) {
    for (let step = 0; step <= count; step++) {
      const index = (start + step) % count;
      foot.push(floor[index]!);
      if (!far[index]) break;
    }
  }
  const strip: Plan = { x: well.datum - 3, y: well.plan.y + CHANNEL + 3, w: MERGE_MAX + 6, d: 6, r: 1 };
  const stripTop = TRAY_TOP + 0.6;
  const ticks: Ticks = topTicks(well.datum, well.datum + MERGE_MAX, 2, 4, strip.y + 0.3, stripTop, [1.8, 3.4], P);
  return {
    wall: pathOf(rim, true),
    floor: pathOf(clipPolygon(floor, rim), true),
    foot: clipPolyline(foot, rim).map((piece) => pathOf(piece)).join(""),
    opening: pathOf(rim, true),
    strip: slabOf(strip, TRAY_TOP, 0.6, P, 3),
    ticks,
    datum: segment([well.datum, well.plan.y + CHANNEL, TRAY_TOP], [well.datum, strip.y, TRAY_TOP], P),
    gapMark: at([well.datum + well.gap, strip.y + strip.d - 1.6, stripTop]),
    count: Array.from({ length: well.index + 1 }, (_, dot) => at([well.plan.x + 5 + dot * 3.4, strip.y + 3, TRAY_TOP])),
  };
}

export const TRAY_ART = {
  halo: haloOf(TRAY, 0, TRAY_TOP, P),
  slab: slabOf(TRAY, 0, TRAY_TOP, P, 8, 1.2),
  wells: WELLS.map(wellArt),
  screws: screwsAt(corners(TRAY, 7), TRAY_TOP, 1.7),
};

/** Wells from the far one to the near one, the order their glass is drawn in. */
export const WELL_ORDER = byDepth(WELLS, (well) => [well.plan.x + well.plan.w / 2, well.plan.y + well.plan.d / 2]).map((well) => well.index);

// ---- 3. the deck, the bottle, and the back of the protractor ----

function arcPoints(from: number, to: number, radius: number): Plane[] {
  const steps = Math.max(2, Math.ceil(((to - from) / Math.PI) * 48));
  return Array.from({ length: steps + 1 }, (_, step) => ray(from + ((to - from) * step) / steps, radius));
}

function bandPiece(from: number, to: number) {
  const ring = [...arcPoints(from, to, BAND_OUT), ...arcPoints(from, to, BAND_IN).reverse()];
  const minor: string[] = [];
  const major: string[] = [];
  for (let mark = 0; mark <= MERGE_MAX; mark += 2) {
    const angle = angleOf(mark);
    if (angle < from - 1e-9 || angle > to + 1e-9) continue;
    const big = mark % 8 === 0;
    (big ? major : minor).push(lineOnTop(ray(angle, BAND_OUT - 0.4), ray(angle, BAND_OUT - (big ? 5.4 : 3)), BAND_TOP, P));
  }
  const gaps = GAPS.map((gap) => angleOf(gap)).filter((angle) => angle >= from && angle < to);
  return {
    solid: extrude(ring, DECK_TOP, BAND_H, P, { convex: false, bevel: 0.5 }),
    ticks: { minor: minor.join(""), major: major.join("") } as Ticks,
    gaps: gaps.map((angle) => at([...ray(angle, 97.5), BAND_TOP] as Point3)),
  };
}

const dashedArc = pathOf(arcPoints(0, Math.PI, GUIDE_R).map(([x, y]) => at([x, y, DECK_TOP])));

/** Stop pins: one just ahead of each gap blade at its stop, as tall as that blade's top. */
export const PINS = GAPS.map((gap, index) => {
  const angle = angleOf(gap);
  const along = ray(angle, PIN_R);
  const side = BLADE_WIDTH / 2 + 1.7;
  const spot: Plane = [along[0] + Math.cos(angle) * side, along[1] + Math.sin(angle) * side];
  return { spot, top: BLADE_Z[index]! + BLADE_THICK[index]! };
});

const bottleShine = (() => {
  const mix = [VIEW[0] - VIEW[1] * 0.35, VIEW[1] + VIEW[0] * 0.35];
  const length = Math.hypot(mix[0]!, mix[1]!);
  return [mix[0]! / length, mix[1]! / length] as Plane;
})();

export const DECK_ART = {
  halo: haloOf(DECK, 0, DECK_TOP, P),
  slab: slabOf(DECK, 0, DECK_TOP, P, 8, 1.2),
  inlay: planOutline(insetPlan(DECK, 7), DECK_TOP, P),
  screws: screwsAt(corners(DECK, 9), DECK_TOP, 1.7),
  engraving: topMatrix([DECK.x + 64, DECK.y + DECK.d - 12], DECK_TOP, P),
  guide: dashedArc,
  guideEnds: [0, Math.PI].map((angle) => at([...ray(angle, GUIDE_R), DECK_TOP] as Point3)),
  pins: byDepth(PINS, (pin) => pin.spot).map((pin) => cylinder(pin.spot[0], pin.spot[1], 1.7, DECK_TOP, pin.top - DECK_TOP, P, 16)),
  back: bandPiece(0, SEAM),
  ends: [0, Math.PI].map((angle) => at([...ray(angle, 99), BAND_TOP] as Point3)),
  seam: at([...ray(SEAM, 99), BAND_TOP] as Point3),
  washer: cylinder(PIVOT[0], PIVOT[1], 11, DECK_TOP, WASHER_TOP - DECK_TOP, P, 40, 0.4),
};

export const BOTTLE_ART = {
  coaster: cylinder(BOTTLE[0], BOTTLE[1], 17, DECK_TOP, 1.6, P, 48, 0.4),
  coasterDots: Array.from({ length: 16 }, (_, index) => {
    const angle = (index / 16) * Math.PI * 2;
    return at([BOTTLE[0] + Math.cos(angle) * 15, BOTTLE[1] + Math.sin(angle) * 15, DECK_TOP + 1.6]);
  }),
  body: cylinder(BOTTLE[0], BOTTLE[1], 12.5, DECK_TOP + 1.6, 34.4, P, 48, 0.6),
  foot: sideArc(BOTTLE[0], BOTTLE[1], 12.5, DECK_TOP + 4.5, P, 32),
  level: sideArc(BOTTLE[0], BOTTLE[1], 12.5, 30, P, 32),
  shine: segment(
    [BOTTLE[0] + bottleShine[0] * 12.5, BOTTLE[1] + bottleShine[1] * 12.5, DECK_TOP + 1.6],
    [BOTTLE[0] + bottleShine[0] * 12.5, BOTTLE[1] + bottleShine[1] * 12.5, 44],
    P,
  ),
  shoulder: cylinder(BOTTLE[0], BOTTLE[1], 9.5, 44, 3.5, P, 40, 0.4),
  neck: cylinder(BOTTLE[0], BOTTLE[1], 4.6, 47.5, 5, P, 28),
  collar: cylinder(BOTTLE[0], BOTTLE[1], 6.2, 52.5, 2, P, 32),
  cap: cylinder(BOTTLE[0], BOTTLE[1], 6.6, 54.5, 7.5, P, 32, 0.3),
  capKnurl: knurl(BOTTLE[0], BOTTLE[1], 6.6, 54.5, 60, 40, P, 0.5),
  capRing: sideArc(BOTTLE[0], BOTTLE[1], 6.6, 60, P, 24),
  bulb: cylinder(BOTTLE[0], BOTTLE[1], 5.2, 62, 8.5, P, 28),
  dome: cylinder(BOTTLE[0], BOTTLE[1], 3.6, 70.5, BULB_TOP - 70.5, P, 24),
  bulbShine: segment(
    [BOTTLE[0] + bottleShine[0] * 5.2, BOTTLE[1] + bottleShine[1] * 5.2, 62],
    [BOTTLE[0] + bottleShine[0] * 5.2, BOTTLE[1] + bottleShine[1] * 5.2, 70.5],
    P,
  ),
  tip: at([BOTTLE[0], BOTTLE[1], BULB_TOP]),
};

// ---- 4. the front of the protractor and the pivot's top hardware ----

export const FRONT_ART = {
  band: bandPiece(SEAM, Math.PI),
};

export const HUB_ART = {
  cap: cylinder(PIVOT[0], PIVOT[1], 7, STACK_TOP, 2, P, 32, 0.4),
  nut: cylinder(PIVOT[0], PIVOT[1], 5, STACK_TOP + 2, 3, P, 32),
  nutKnurl: knurl(PIVOT[0], PIVOT[1], 5, STACK_TOP + 2, STACK_TOP + 5, 36, P, 0.4),
  pin: cylinder(PIVOT[0], PIVOT[1], 1.6, STACK_TOP + 5, 3, P, 16),
  pinDot: at([PIVOT[0], PIVOT[1], STACK_TOP + 8]),
};

