// The feeler fan, rebuilt every frame: six gap blades that stop at their own gaps, the merge
// blade on top, and the halo under them all.
import { extrude, lineOnTop, pathOf, type Plane, type SolidPaths } from "../../kit/iso-kit";
import { BLADE_BUTT, BLADE_THICK, BLADE_TIP, BLADE_WIDTH, BLADE_Z, DECK_TOP, MERGE_THICK, MERGE_TIP, P, PIVOT, at, ray } from "./geometry";
import { angleOf, bladeAngle, GAPS, isJoined } from "./rig";

export interface BladePaths extends SolidPaths {
  /** The centre line along the blade's top. */
  line: string;
}

export interface FanPose {
  /** The six gap blades, bottom of the stack first, then the merge blade. */
  blades: BladePaths[];
  halo: string;
  /** Which gap blades have been left at their stops (their pair has joined). */
  out: boolean[];
}

const HALF = BLADE_WIDTH / 2;
const END_STEPS = 10;

/** A blade's plan: a strip with rounded tip and butt, turned to `angle` about the pivot. */
function bladeRing(angle: number, tip: number): Plane[] {
  const along: Plane = [Math.sin(angle), -Math.cos(angle)];
  const across: Plane = [Math.cos(angle), Math.sin(angle)];
  const point = (reach: number, side: number): Plane => [PIVOT[0] + along[0] * reach + across[0] * side, PIVOT[1] + along[1] * reach + across[1] * side];
  const ring: Plane[] = [];
  for (let step = 0; step <= END_STEPS; step++) {
    const turn = -Math.PI / 2 + (Math.PI * step) / END_STEPS;
    ring.push(point(tip - HALF + Math.cos(turn) * HALF, Math.sin(turn) * HALF));
  }
  for (let step = 0; step <= END_STEPS; step++) {
    const turn = Math.PI / 2 + (Math.PI * step) / END_STEPS;
    ring.push(point(-BLADE_BUTT + HALF + Math.cos(turn) * HALF, Math.sin(turn) * HALF));
  }
  return ring;
}

function bladeOf(angle: number, tip: number, z: number, thick: number): BladePaths & { ring: Plane[] } {
  const ring = bladeRing(angle, tip);
  const paths = extrude(ring, z, thick, P, { convex: true, bevel: 0.4 });
  const line = lineOnTop(ray(angle, 10), ray(angle, tip), z + thick, P);
  return { ...paths, line, ring };
}

/** Every blade at one merge value. */
export function fanAt(merge: number): FanPose {
  const built = GAPS.map((gap, index) => bladeOf(bladeAngle(gap, merge), BLADE_TIP, BLADE_Z[index]!, BLADE_THICK[index]!));
  built.push(bladeOf(angleOf(merge), MERGE_TIP, BLADE_Z[GAPS.length]!, MERGE_THICK));
  const halo = built.map(({ ring }) => pathOf(ring.map(([x, y]) => at([x, y, DECK_TOP])), true)).join("");
  return {
    blades: built.map(({ ring: _ring, ...paths }) => paths),
    halo,
    out: GAPS.map((gap) => isJoined(gap, merge)),
  };
}
