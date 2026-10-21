// Static parts of the spot plate as JSX, built once and handed to the client component as element
// props. Each prop's root carries a stable key (references/react.md, "The large-page key-warning trap").
import * as React from "react";
import { Dots, FaceText, Line, Solid } from "../../kit/react/draw";
import { BASE_ART, BOTTLE_ART, DECK_ART, FRONT_ART, HUB_ART, TRAY_ART, type Screws } from "./geometry";
import { SpotPlateLive } from "./live";

function ScrewHeads({ screws, size = 0.5 }: { screws: Screws; size?: number }) {
  return (
    <>
      <Line d={screws.rings} tone="lo" />
      <Dots points={screws.dots} size={size} tone="mid" />
    </>
  );
}

const BASE = (
  <g key="base">
    <path className="iso-halo" d={BASE_ART.halo} />
    {BASE_ART.feet.map((foot, index) => (
      <React.Fragment key={index}>
        <Solid paths={foot.flange} tone="lo" />
        <Solid paths={foot.foot} tone="lo" />
      </React.Fragment>
    ))}
    <Solid paths={BASE_ART.slab} tone="mid" />
    <Line d={BASE_ART.groove} tone="faint" />
    <Line d={BASE_ART.inlay} tone="faint" />
    <ScrewHeads screws={BASE_ART.screws} size={0.55} />
  </g>
);

const TRAY = (
  <g key="tray">
    <path className="iso-halo" d={TRAY_ART.halo} />
    <Solid paths={TRAY_ART.slab} tone="mid" className="ml-plate" />
    {TRAY_ART.wells.map((well, index) => (
      <g key={index}>
        <path className="ml-wall" d={well.wall} />
        <path className="ml-floor" d={well.floor} />
        <Line d={well.foot} tone="faint" />
        <Line d={well.opening} tone="mid" />
        <Solid paths={well.strip} tone="lo" crease="none" />
        <Line d={well.ticks.minor} tone="lo" />
        <Line d={well.ticks.major} tone="mid" />
        <Line d={well.datum} tone="hi" />
        <Dots points={[well.gapMark]} size={0.85} tone="hi" />
        <Dots points={well.count} size={0.6} tone="mid" />
      </g>
    ))}
    <ScrewHeads screws={TRAY_ART.screws} />
  </g>
);

const DECK = (
  <g key="deck">
    <path className="iso-halo" d={DECK_ART.halo} />
    <Solid paths={DECK_ART.slab} tone="mid" />
    <Line d={DECK_ART.inlay} tone="faint" />
    <ScrewHeads screws={DECK_ART.screws} />
    <FaceText transform={DECK_ART.engraving} size={5} tone="lo">
      merge
    </FaceText>
    <Solid paths={BOTTLE_ART.coaster} tone="lo" />
    <Dots points={BOTTLE_ART.coasterDots} size={0.45} tone="lo" />
    <Solid paths={BOTTLE_ART.body} tone="mid" className="ml-bottle" />
    <Line d={BOTTLE_ART.foot} tone="faint" />
    <Line d={BOTTLE_ART.level} tone="mid" />
    <Line d={BOTTLE_ART.shine} tone="faint" />
    <Solid paths={BOTTLE_ART.shoulder} tone="mid" className="ml-bottle" />
    <Solid paths={BOTTLE_ART.neck} tone="mid" crease="none" />
    <Solid paths={BOTTLE_ART.collar} tone="mid" />
    <Solid paths={BOTTLE_ART.cap} tone="mid" />
    <Line d={BOTTLE_ART.capKnurl} tone="lo" />
    <Line d={BOTTLE_ART.capRing} tone="faint" />
    <Solid paths={BOTTLE_ART.bulb} tone="lo" />
    <Line d={BOTTLE_ART.bulbShine} tone="faint" />
    <Solid paths={BOTTLE_ART.dome} tone="lo" />
    <Dots points={[BOTTLE_ART.tip]} size={0.55} tone="mid" />
  </g>
);

/** Drawn after the fan's halo, under the blades: the guide arc, the stop pins, the band's far piece, the washer. */
const BACK = (
  <g key="back">
    <Line d={DECK_ART.guide} tone="lo" dashed />
    <Dots points={DECK_ART.guideEnds} size={0.6} tone="lo" />
    {DECK_ART.pins.map((paths, index) => (
      <Solid key={index} paths={paths} tone="mid" />
    ))}
    <Solid paths={DECK_ART.back.solid} tone="mid" />
    <Line d={DECK_ART.back.ticks.minor} tone="lo" />
    <Line d={DECK_ART.back.ticks.major} tone="mid" />
    <Dots points={DECK_ART.back.gaps} size={0.7} tone="hi" />
    <Dots points={[DECK_ART.ends[0]!]} size={0.7} tone="mid" />
    <Solid paths={DECK_ART.washer} tone="mid" />
  </g>
);

/** The band's near piece: drawn after the gap blades, which pass behind it. */
const FRONT = (
  <g key="front">
    <Solid paths={FRONT_ART.band.solid} tone="mid" />
    <Line d={FRONT_ART.band.ticks.minor} tone="lo" />
    <Line d={FRONT_ART.band.ticks.major} tone="mid" />
    <Dots points={FRONT_ART.band.gaps} size={0.7} tone="hi" />
    <Dots points={[DECK_ART.ends[1]!, DECK_ART.seam]} size={0.7} tone="mid" />
  </g>
);

const HUB = (
  <g key="hub">
    <Solid paths={HUB_ART.cap} tone="mid" />
    <Solid paths={HUB_ART.nut} tone="mid" />
    <Line d={HUB_ART.nutKnurl} tone="lo" />
    <Solid paths={HUB_ART.pin} tone="mid" />
    <Dots points={[HUB_ART.pinDot]} size={0.5} tone="hi" />
  </g>
);

/** The whole plate: static parts built here, the glass, the fan and input in the client component. */
export function SpotPlateArt() {
  return <SpotPlateLive base={BASE} tray={TRAY} deck={DECK} back={BACK} front={FRONT} hub={HUB} />;
}
