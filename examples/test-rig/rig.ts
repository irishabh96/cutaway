// The glass button's behaviour as a pure model: no DOM, no React.
// Everything the figure shows (shape, readout, aria text, caption numbers) is read from here.

/** Half the rest size, in px: the button is 120 × 32 at rest. */
export const HALF: readonly [number, number] = [60, 16];

/** How far the lean can go: 14 px, or 15% of the length on a short button. */
export const GIVE = Math.min(14, 0.15 * 2 * HALF[0]);

/** A press swells every side by 8%, but never by more than 6 px. */
export const SWELL = Math.min(0.08, 6 / HALF[0]);

/** Along the lean the capsule lengthens by at most this share of its half-length. */
export const STRETCH = 0.08;

/** The deepest dip below rest on the way back, as a share of a full swell. */
const DIP_FLOOR = -0.25;

const SUBSTEP = 1 / 240;
const SNAP = 5e-4;

export interface Spring {
  stiffness: number;
  drag: number;
}

export const PRESS: Spring = { stiffness: 700, drag: 32 };
export const HOLD: Spring = { stiffness: 540, drag: 40 };
export const RELEASE: Spring = { stiffness: 320, drag: 16 };

export interface Motion {
  at: number;
  rate: number;
}

/** The state of one button: how far it has swollen (0 rest, 1 pressed) and how far it leans, in px. */
export interface Member {
  swell: Motion;
  lean: Motion;
}

export const restingMember = (): Member => ({ swell: { at: 0, rate: 0 }, lean: { at: 0, rate: 0 } });

/** Rubber-band give: the further you pull, the less it follows. */
export function rubberBand(distance: number, give = GIVE) {
  return give * (1 - 1 / (1 + (0.55 * distance) / give));
}

export const leanFor = (pull: number) => Math.sign(pull) * rubberBand(Math.abs(pull));

function advance(motion: Motion, target: number, spring: Spring, dt: number, calm: boolean) {
  const drag = calm ? 2 * Math.sqrt(spring.stiffness) : spring.drag;
  const count = Math.max(1, Math.ceil(dt / SUBSTEP));
  const slice = dt / count;
  for (let index = 0; index < count; index++) {
    motion.rate += ((target - motion.at) * spring.stiffness - motion.rate * drag) * slice;
    motion.at += motion.rate * slice;
  }
  if (Math.abs(target - motion.at) < SNAP && Math.abs(motion.rate) < SNAP) {
    motion.at = target;
    motion.rate = 0;
  }
  return motion.at === target && motion.rate === 0;
}

/**
 * Advance the button by dt seconds. `held` is whether a finger is on it, `pull` how far
 * (signed, px) the finger has moved from where it pressed. Under reduced motion (`calm`)
 * every spring is critically damped and the button never leans. Returns true once settled.
 */
export function step(member: Member, held: boolean, pull: number, dt: number, calm = false) {
  const swellDone = advance(member.swell, held ? 1 : 0, held ? PRESS : RELEASE, dt, calm);
  if (member.swell.at < DIP_FLOOR) {
    member.swell.at = DIP_FLOOR;
    member.swell.rate = Math.max(0, member.swell.rate);
  }
  const leanTarget = held && !calm ? leanFor(pull) : 0;
  const leanDone = advance(member.lean, leanTarget, held ? HOLD : RELEASE, dt, calm);
  return swellDone && leanDone;
}

export const isResting = (member: Member) =>
  member.swell.at === 0 && member.swell.rate === 0 && member.lean.at === 0 && member.lean.rate === 0;

export interface Pose {
  /** Half-length and half-depth of the capsule as drawn. */
  half: [number, number];
  /** Where the capsule's centre sits along x. */
  centre: number;
  /** How far the capsule's leading end has moved, px (signed). */
  lean: number;
  /** Extra half-length from the stretch along the lean (signed with the lean). */
  stretch: number;
  /** Half-length before the stretch: the swollen size the grab point is measured against. */
  grown: number;
  width: number;
  height: number;
}

/** The shape of the button for a member's current state. */
export function poseOf(member: Member): Pose {
  const grow = 1 + SWELL * member.swell.at;
  const grown = HALF[0] * grow;
  const deep = HALF[1] * grow;
  const lean = member.lean.at;
  const cap = STRETCH * grown;
  // Starts at about a third of the lean (1/π) and saturates at the cap; odd, so smooth through zero.
  const stretch = cap * Math.tanh(lean / (Math.PI * cap));
  const long = grown + Math.abs(stretch);
  const thin = deep * Math.sqrt(grown / long);
  return { half: [long, thin], centre: lean - stretch, lean, stretch, grown, width: 2 * long, height: 2 * thin };
}

const one = (value: number) => {
  const text = value.toFixed(1);
  return text === "-0.0" ? "0.0" : text;
};

export const readoutOf = (pose: Pose) => `${one(pose.width)} × ${one(pose.height)} · lean ${one(Math.abs(pose.lean))} px`;

export function stateWordOf(member: Member, held: boolean) {
  if (held) return "Pressed";
  return isResting(member) ? "At rest" : "Springing back";
}

export const valueTextOf = (pose: Pose, word: string, pull: number) =>
  `${word}: ${one(pose.width)} by ${one(pose.height)} pixels, pulled ${one(Math.abs(pull))} px, leaning ${one(Math.abs(pose.lean))} px`;

export const REST_POSE = poseOf(restingMember());
export const REST_READOUT = readoutOf(REST_POSE);
export const REST_VALUE_TEXT = valueTextOf(REST_POSE, "At rest", 0);

/** The pose the button settles into while held and pulled `pull` px. */
export function heldPose(pull: number): Pose {
  const member = restingMember();
  member.swell.at = 1;
  member.lean.at = leanFor(pull);
  return poseOf(member);
}

export const PRESSED = heldPose(0);
export const PULLED_80 = heldPose(80);
