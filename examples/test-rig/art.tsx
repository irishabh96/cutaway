// Static parts of the rig as JSX, built once and handed to the client component as element props.
// Each prop's root carries a stable key (see references/react.md, "The large-page key-warning trap").
import * as React from "react";
import { Dots, FaceText, Line, Solid } from "../../kit/react/draw";
import {
  ARM_ART,
  BACK_FRAME_ART,
  BASE_ART,
  CARRIAGE_ART,
  DIAL_ART,
  FINGER_ART,
  FRONT_FRAME_ART,
  PLUNGER_ART,
  PROBE_ART,
  RAIL_ART,
  RIDER_ART,
  REST_OUTLINE,
  RODS_ART,
  type Screws,
} from "./geometry";
import { RigLive } from "./live";

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
        <Solid paths={foot.foot} tone="mid" />
      </React.Fragment>
    ))}
    <Solid paths={BASE_ART.slab} tone="mid" />
    <Line d={BASE_ART.groove} tone="faint" />
    <ScrewHeads screws={BASE_ART.screws} size={0.55} />
    <Solid paths={BASE_ART.label} tone="lo" crease="none" />
    <Line d={BASE_ART.labelInset} tone="faint" />
    {BASE_ART.labelRules.map((d, index) => (
      <Line key={index} d={d} tone="lo" free />
    ))}
    <Dots points={BASE_ART.labelScrews} size={0.45} tone="mid" />
  </g>
);

const RAIL = (
  <g key="rail">
    {RAIL_ART.posts.map((post, index) => (
      <React.Fragment key={index}>
        <Solid paths={post.foot} tone="lo" />
        <Solid paths={post.post} tone="mid" crease="none" />
        <Line d={post.seams} tone="faint" />
      </React.Fragment>
    ))}
    <Solid paths={RAIL_ART.beam} tone="mid" />
    <Line d={RAIL_ART.ruler.minor} tone="lo" />
    <Line d={RAIL_ART.ruler.major} tone="mid" />
    <ScrewHeads screws={RAIL_ART.beamScrews} />
    {RAIL_ART.stops.map((paths, index) => (
      <Solid key={index} paths={paths} tone="mid" />
    ))}
    <Dots points={RAIL_ART.stopScrews} size={0.5} tone="mid" />
  </g>
);

const RIDER = (
  <g key="rider">
    <Solid paths={RIDER_ART.tab} tone="mid" crease="none" />
    <Line d={RIDER_ART.mark} tone="hi" />
  </g>
);

const PROBE = (
  <g key="probe">
    <Solid paths={PROBE_ART.block} tone="mid" />
    <Line d={PROBE_ART.index} tone="lit" />
    <Solid paths={PROBE_ART.neck} tone="mid" crease="none" />
    <Solid paths={PROBE_ART.knob} tone="mid" />
    <Line d={PROBE_ART.knurl} tone="lo" />
    <Line d={PROBE_ART.pointer} tone="hi" />
  </g>
);

const BACK_FRAME = (
  <g key="back-frame">
    <Solid paths={BACK_FRAME_ART.floor} tone="lo" crease="none" />
    <Line d={BACK_FRAME_ART.grid} tone="faint" />
    <Solid paths={BACK_FRAME_ART.left} tone="mid" />
    <Line d={BACK_FRAME_ART.seats} tone="lo" />
    <ScrewHeads screws={BACK_FRAME_ART.leftScrews} />
    <Solid paths={BACK_FRAME_ART.back} tone="mid" />
    <ScrewHeads screws={BACK_FRAME_ART.backScrews} />
  </g>
);

const SHADOW = <path key="shadow" className="iso-halo ms-shadow" d={CARRIAGE_ART.shadow} />;

const RODS = (
  <g key="rods">
    {RODS_ART.map((paths, index) => (
      <Solid key={index} paths={paths} tone="mid" />
    ))}
  </g>
);

const CARRIAGE = (
  <g key="carriage">
    {CARRIAGE_ART.bushings.map((paths, index) => (
      <Solid key={index} paths={paths} tone="mid" crease="none" />
    ))}
    <Solid paths={CARRIAGE_ART.plate} tone="mid" />
    <Line d={CARRIAGE_ART.seat} tone="faint" />
    <ScrewHeads screws={CARRIAGE_ART.plateScrews} size={0.45} />
    <Dots points={CARRIAGE_ART.rivets} size={0.4} tone="mid" />
    <Solid paths={CARRIAGE_ART.contact} tone="mid" />
    <Line d={CARRIAGE_ART.seats} tone="lo" />
  </g>
);

const REST = <Line key="rest" d={REST_OUTLINE} tone="mid" dotted />;

const PLUNGER = (
  <g key="plunger">
    <Solid paths={PLUNGER_ART.rod} tone="mid" />
    <Solid paths={PLUNGER_ART.collar} tone="mid" />
  </g>
);

const FRONT_FRAME = (
  <g key="front-frame">
    <Solid paths={FRONT_FRAME_ART.front} tone="mid" />
    <Line d={FRONT_FRAME_ART.ruler.minor} tone="lo" />
    <Line d={FRONT_FRAME_ART.ruler.major} tone="mid" />
    <Line d={FRONT_FRAME_ART.zero} tone="hi" />
    <ScrewHeads screws={FRONT_FRAME_ART.frontScrews} />
    <Solid paths={FRONT_FRAME_ART.right} tone="mid" />
    <Line d={FRONT_FRAME_ART.bores} tone="lo" />
    <Line d={FRONT_FRAME_ART.rodEnds} tone="faint" />
    <ScrewHeads screws={FRONT_FRAME_ART.rightScrews} />
  </g>
);

const DIAL = (
  <g key="dial">
    <Solid paths={DIAL_ART.stand} tone="lo" />
    <ScrewHeads screws={DIAL_ART.standScrews} size={0.45} />
    <Solid paths={DIAL_ART.clamp} tone="mid" />
    <Dots points={[DIAL_ART.clampScrew]} size={0.5} tone="mid" />
    <Solid paths={DIAL_ART.sleeve} tone="mid" />
    <Solid paths={DIAL_ART.lug} tone="mid" />
    <Solid paths={DIAL_ART.puck} tone="mid" crease="lo" />
    <Line d={DIAL_ART.band} tone="lo" />
    <Line d={DIAL_ART.bandSeam} tone="faint" />
    <Line d={DIAL_ART.bezel} tone="lo" />
    <Line d={DIAL_ART.face} tone="faint" />
    <Line d={DIAL_ART.ticks.minor} tone="lo" />
    <Line d={DIAL_ART.ticks.major} tone="mid" />
    <Dots points={DIAL_ART.give} size={0.7} tone="hi" />
    <FaceText transform={DIAL_ART.unit} size={3.2} tone="lo" anchor="middle">
      px
    </FaceText>
    <Solid paths={DIAL_ART.crownStem} tone="mid" crease="none" />
    <Solid paths={DIAL_ART.crown} tone="mid" />
  </g>
);

const HUB = (
  <g key="hub">
    <Line d={DIAL_ART.hub} tone="hi" />
    <Dots points={[DIAL_ART.hubDot]} size={0.55} tone="hi" />
  </g>
);

const FINGER = (
  <g key="finger">
    <Solid paths={FINGER_ART.pad} tone="mid" />
    <Solid paths={FINGER_ART.stem} tone="mid" crease="none" />
    <Solid paths={FINGER_ART.collar} tone="mid" />
  </g>
);

const ARM = (
  <g key="arm">
    <Solid paths={ARM_ART.arm} tone="mid" />
    <Solid paths={ARM_ART.collar} tone="mid" />
    <Solid paths={ARM_ART.housing} tone="mid" />
    <Line d={ARM_ART.seams} tone="faint" />
    <Solid paths={ARM_ART.cap} tone="mid" />
    <Solid paths={ARM_ART.lockNeck} tone="mid" crease="none" />
    <Solid paths={ARM_ART.lockHead} tone="mid" />
  </g>
);

/** The whole rig: static parts built here, motion and input in the client component. */
export function TestRigArt() {
  return (
    <RigLive
      base={BASE}
      rail={RAIL}
      rider={RIDER}
      probe={PROBE}
      backFrame={BACK_FRAME}
      shadow={SHADOW}
      rods={RODS}
      carriage={CARRIAGE}
      rest={REST}
      plunger={PLUNGER}
      frontFrame={FRONT_FRAME}
      dial={DIAL}
      hub={HUB}
      finger={FINGER}
      arm={ARM}
    />
  );
}
