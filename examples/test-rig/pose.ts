// Per-frame shapes: only what changes is rebuilt here (the capsule, the four coils, the needle,
// the pull wire, the rest outline's fade) plus the transforms of the parts that slide.
import { coil, insetPlan, lineOnTop, onTop, pathOf, planOutline, slabOf, type Flat, type Plan, type SolidPaths } from "../../kit/iso-kit";
import { HALF, type Pose } from "./rig";
import { at, COIL, DIAL, FRAME, GLASS_H, GLASS_TOP, GLASS_Z, HOME, LIFT, needleAngle, P, ROD_Y, ROD_Z, shift } from "./view";

export interface GlassPaths extends SolidPaths {
  rim: string;
  shine: string;
}

export interface Hand {
  /** Whether anything (the reader or the tour) is pressing the glass. */
  held: boolean;
  /** The grab point in the capsule's own coordinates: −1 at the left end, 1 at the right. */
  grab: number;
  /** Finger position along x. */
  finger: number;
  /** How high the finger is above the glass. */
  lift: number;
  /** Where the rider sits on the rail. */
  rider: number;
}

export interface Frame {
  glass: GlassPaths;
  /** Back runs of the four coils, then the front runs: left-back, left-front, right-back, right-front. */
  coilsBack: string[];
  coilsFront: string[];
  carriage: string;
  probe: string;
  finger: string;
  rider: string;
  needle: string;
  wire: { d: string; from: Flat; to: Flat; shown: boolean };
  restOpacity: number;
}

const GLASS_STEPS = 10;
const LEFT = -FRAME.inner;
const RIGHT = FRAME.inner;
const COILED = [
  [-1, -ROD_Y],
  [-1, ROD_Y],
  [1, -ROD_Y],
  [1, ROD_Y],
] as const;

function glassOf(pose: Pose): GlassPaths {
  const [long, deep] = pose.half;
  const plan: Plan = { x: pose.centre - long, y: -deep, w: long * 2, d: deep * 2, r: deep };
  const paths = slabOf(plan, GLASS_Z, GLASS_H, P, GLASS_STEPS, 1);
  const rim = planOutline(insetPlan(plan, 2.4), GLASS_TOP, P, GLASS_STEPS);
  const shine = lineOnTop([pose.centre - long * 0.55, -deep + 3.4], [pose.centre + long * 0.2, -deep + 3.4], GLASS_TOP, P);
  return { ...paths, rim, shine };
}

function needleOf(lean: number) {
  const angle = needleAngle(lean);
  const along = [Math.sin(angle), -Math.cos(angle)];
  const across = [Math.cos(angle), Math.sin(angle)];
  const point = (reach: number, side: number): [number, number] => [
    DIAL.x + along[0]! * reach + across[0]! * side,
    DIAL.y + along[1]! * reach + across[1]! * side,
  ];
  const tip = DIAL.radius - 3.8;
  return onTop([point(-3.4, -0.55), point(0, -1.05), point(tip, -0.12), point(tip, 0.12), point(0, 1.05), point(-3.4, 0.55)], DIAL.top + 0.25, P, true);
}

const tenth = (value: number) => Math.round(value * 10) / 10;

/** Everything the live layer writes for one pose of the model and one position of the hand. */
export function frameOf(pose: Pose, hand: Hand): Frame {
  const lean = pose.lean;
  const coilsBack: string[] = [];
  const coilsFront: string[] = [];
  for (const [side, y] of COILED) {
    const from = side < 0 ? LEFT : RIGHT;
    const to = side * COIL.end + lean;
    const turns = coil(from, to, [y, ROD_Z], COIL.radius, COIL.turns, "x", P);
    coilsBack.push(turns.back);
    coilsFront.push(turns.front);
  }

  const grabX = pose.centre + hand.grab * pose.half[0];
  const fromPoint = at([grabX, 0, GLASS_TOP]);
  const toPoint = at([hand.finger, 0, GLASS_TOP + hand.lift]);
  const from: Flat = [tenth(fromPoint[0]), tenth(fromPoint[1])];
  const to: Flat = [tenth(toPoint[0]), tenth(toPoint[1])];
  const shown = hand.held && Math.hypot(hand.finger - grabX, hand.lift) > 0.6;

  const off = Math.max(Math.abs(pose.centre - pose.half[0] + HALF[0]), Math.abs(pose.centre + pose.half[0] - HALF[0]), Math.abs(pose.half[1] - HALF[1]));

  return {
    glass: glassOf(pose),
    coilsBack,
    coilsFront,
    carriage: shift(lean),
    probe: shift(hand.finger - HOME),
    finger: shift(hand.finger - HOME, hand.lift - LIFT),
    rider: shift(hand.rider - HOME),
    needle: needleOf(lean),
    wire: { d: shown ? pathOf([from, to]) : "", from, to, shown },
    restOpacity: Math.min(1, Math.max(0, (off - 0.4) / 1.6)),
  };
}
