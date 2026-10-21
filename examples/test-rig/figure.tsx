// Fig 6, "Press and pull": a glass button on a sprung test rig. The entry point the site shows as source.
import type { LegendKey } from "../../kit/iso-kit";
import { Plate } from "../../kit/react/draw";
import { TestRigArt } from "./art";
import { HALF, PRESSED, PULLED_80, REST_READOUT } from "./rig";
import "./stretch.css";

const KEYS: LegendKey[] = [
  { mark: "raised", label: "the glass while it is held" },
  { mark: "dotted", label: "where it rests" },
  { mark: "edge", label: "the pull, from where I pressed to the finger" },
];

const px = (value: number) => value.toFixed(1);

const CAPTION =
  `A ${HALF[0] * 2} × ${HALF[1] * 2} glass button on a test rig: a carriage on two guide rods, held by four coil springs, ` +
  `a finger probe on a rail behind it, and a dial gauge that reads the lean. Pressed, it swells to ` +
  `${px(PRESSED.width)} × ${px(PRESSED.height)}; pulled 80 px it leans ${px(Math.abs(PULLED_80.lean))} px, ` +
  `giving less the further it goes, and let go it springs back once past rest.`;

export function TestRigFigure() {
  return (
    <Plate fig="Fig 6" title="Press and pull" hint="Press, then pull ← →" readout={REST_READOUT} keys={KEYS} caption={CAPTION}>
      <TestRigArt />
    </Plate>
  );
}
