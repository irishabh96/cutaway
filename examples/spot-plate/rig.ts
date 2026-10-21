// The spot plate as a pure model: six pairs of drops, one `merge` threshold, and the words for it.

/** The six gaps between the drops of each pair, in px, in well order. */
export const GAPS = [4, 10, 16, 24, 32, 44] as const;
export const PAIRS = GAPS.length;

/** Radii of the two drops in every pair. */
export const BIG = 30;
export const SMALL = 22;

/** `merge` runs 0 to 48 px in 1 px steps and rests at 20. */
export const MERGE_MIN = 0;
export const MERGE_MAX = 48;
export const MERGE_REST = 20;

/** A pair has run together exactly when its gap is less than merge. */
export const isJoined = (gap: number, merge: number) => gap < merge;
export const joinedGaps = (merge: number) => GAPS.filter((gap) => isJoined(gap, merge));
export const joinedCount = (merge: number) => joinedGaps(merge).length;

/**
 * The smooth union's blend reach for a merge value. With this reach the two outlines meet
 * exactly at merge = gap, and a pair stays two plain discs while its gap is at least 2 × merge.
 */
export const reachOf = (merge: number) => 2 * merge;

/** Angle across the protractor, radians: 0 px at the start of the arc, 48 px half a turn later. */
export const angleOf = (merge: number) => (Math.min(MERGE_MAX, Math.max(MERGE_MIN, merge)) / MERGE_MAX) * Math.PI;

/** A gap blade follows the merge blade until it reaches its own stop, the angle of its gap. */
export const bladeAngle = (gap: number, merge: number) => angleOf(Math.min(gap, merge));

const WORDS = ["no", "one", "two", "three", "four", "five", "six"];
export const wordOf = (count: number) => WORDS[count] ?? String(count);

/** "4", "4 and 10", "4, 10 and 16". */
export function listOf(values: readonly number[]) {
  if (values.length < 2) return values.join("");
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

export const readoutOf = (merge: number) => `merge ${Math.round(merge)} px · ${joinedCount(merge)} of ${PAIRS} joined`;

export function valueTextOf(merge: number) {
  const shown = Math.round(merge);
  const joined = joinedGaps(merge);
  const apart = GAPS.filter((gap) => !isJoined(gap, merge));
  if (!joined.length) return `Merge ${shown} px: no pairs joined; all ${PAIRS} gaps, ${listOf(GAPS)} px, stay apart`;
  if (!apart.length) return `Merge ${shown} px: all ${PAIRS} pairs joined, gaps ${listOf(GAPS)} px`;
  return `Merge ${shown} px: ${joined.length} of ${PAIRS} pairs joined, gaps ${listOf(joined)} px; ${listOf(apart)} px stay apart`;
}

export const REST_READOUT = readoutOf(MERGE_REST);
export const REST_VALUE_TEXT = valueTextOf(MERGE_REST);
