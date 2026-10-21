// Camera and world layout for the test rig. World units are px of the button; z is up.
// The glass sits centred on (0, 0) on top of the carriage; x runs along the rig.
import { axisVector, boxCorners, fitProjection, iso, type Plan, type Point3 } from "../../kit/iso-kit";

export const WIDTH = 600;
export const HEIGHT = 340;
export const AZIMUTH = 57;
export const PAD = 34;

/** Base plate on its feet. */
export const BASE: Plan = { x: -142, y: -82, w: 308, d: 128, r: 9 };
export const BASE_Z = -12;
export const FOOT_Z = -17;

/** Frame: four bars round a floor. The end bars hold the rods; the long bars are low. */
export const FRAME = { inner: 100, outer: 106, back: -34, front: 34, bar: 6, endTop: 18, sideTop: 9 };
export const FLOOR_TOP = 1;

/** Guide rods run along x at y = ±18. */
export const ROD_Y = 18;
export const ROD_Z = 8;
export const ROD_R = 2;

/** Carriage plate and the glass on it. */
export const CARRIAGE: Plan = { x: -68, y: -26, w: 136, d: 52, r: 4 };
export const CARRIAGE_Z = 11;
export const CARRIAGE_TOP = 15;
export const GLASS_Z = CARRIAGE_TOP;
export const GLASS_H = 5.5;
export const GLASS_TOP = GLASS_Z + GLASS_H;

/** Coil springs: one each side of each bushing, between the end bar and the carriage. */
export const COIL = { radius: 4.4, turns: 6, end: CARRIAGE.x + CARRIAGE.w };

/** The plunger runs from the carriage's right end, through the end bar, into the dial's sleeve. */
export const PLUNGER_Z = 12;

/** The dial gauge stands to the right of the frame. Its needle turns once per 20 px of lean. */
export const DIAL = { x: 131, y: 0, radius: 16, z: 6, top: 17 };
export const PX_PER_TURN = 20;
/** The needle's angle in radians (kit convention: 0 points to −y, positive turns toward +x). */
export const needleAngle = (lean: number) => (-lean / PX_PER_TURN) * Math.PI * 2;

/** The rail behind the frame and the probe that rides it. */
export const RAIL_Y = -66;
export const RAIL_Z = 50;
export const BEAM: Plan = { x: -128, y: RAIL_Y - 4, w: 256, d: 8, r: 1.5 };
export const BEAM_BOTTOM = RAIL_Z - 4;
export const BEAM_TOP = RAIL_Z + 4;
export const POST_X = 120;
export const STOP_TOP = BEAM_TOP + 6;

/** Probe home along x, how high the finger hovers when not pressing, and the travel limits. */
export const HOME = 45;
export const LIFT = 12;
export const HOVER_RANGE: readonly [number, number] = [-98, 48];
export const GRAB_LIMIT = 52;
export const PULL_LIMIT = 62;
export const PULL_MOST = GRAB_LIMIT + PULL_LIMIT;

export const P = fitProjection(
  [...boxCorners(BASE, FOOT_Z, 0), ...boxCorners({ x: BEAM.x, y: BEAM.y - 1, w: BEAM.w, d: BEAM.d + 2, r: 0 }, BEAM_BOTTOM, STOP_TOP)],
  WIDTH,
  HEIGHT,
  { pad: PAD, azimuth: AZIMUTH },
);

/** Project a world point. */
export const at = (point: Point3) => iso(point, P);

const ALONG_X = axisVector(P, [1, 0, 0]);
const ALONG_Z = axisVector(P, [0, 0, 1]);
const ORIGIN = at([0, 0, 0]);
const fine = (value: number) => Math.round(value * 100) / 100;

/** An SVG translate that moves a part `x` along world x and `z` up. */
export function shift(x: number, z = 0) {
  if (!x && !z) return "";
  const dx = ALONG_X[0] * x + ALONG_Z[0] * z;
  const dy = ALONG_X[1] * x + ALONG_Z[1] * z;
  return `translate(${fine(dx)} ${fine(dy)})`;
}

/** World x under a horizontal position on the svg, in viewBox units. */
export const worldXAt = (svgX: number) => (svgX - ORIGIN[0]) / ALONG_X[0];
