// Fig 7, "Spot plate": six pairs of glass drops that run together as a fan of feeler blades opens.
// The entry point the site shows as source.
import type { LegendKey } from "../../kit/iso-kit";
import { Plate } from "../../kit/react/draw";
import { SpotPlateArt } from "./art";
import { BIG, GAPS, joinedCount, joinedGaps, listOf, MERGE_REST, REST_READOUT, SMALL, wordOf } from "./rig";
import "./spot-plate.css";

const KEYS: LegendKey[] = [
  { mark: "raised", label: `a joined pair, one piece of glass R${BIG} + R${SMALL}` },
  { mark: "edge", label: "the neck where a pair runs together" },
  { mark: "lit", label: "the merge blade" },
];

const joined = joinedGaps(MERGE_REST);
const out = joinedCount(MERGE_REST);

const CAPTION =
  `A spot plate with ${wordOf(GAPS.length)} channels, each holding a pair of glass drops at gaps from ${GAPS[0]} to ${GAPS[GAPS.length - 1]} px. ` +
  `Each pair is drawn from one distance field, so a pair closer than merge runs together into one piece. ` +
  `The fan sets merge, and each blade stops at its own gap: at ${MERGE_REST} px the ${listOf(joined)} px pairs have joined, ` +
  `so ${wordOf(out)} blade${out === 1 ? " is" : "s are"} out.`;

export function SpotPlateFigure() {
  return (
    <Plate fig="Fig 7" title="Spot plate" hint="Slide across to open the fan" readout={REST_READOUT} keys={KEYS} caption={CAPTION}>
      <SpotPlateArt />
    </Plate>
  );
}
