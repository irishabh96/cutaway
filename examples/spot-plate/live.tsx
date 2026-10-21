"use client";

// The one client component of the spot plate: the glass and the fan (rebuilt through refs),
// the loop, the idle tour, pointer and keys, aria and the readout.
import * as React from "react";
import { IsoFigure } from "../../kit/react/draw";
import { asksForStillness, follow, useInView, useLoop, useReadout } from "../../kit/react/live";
import { isBuilt, pairShape, quantise, type GlassPiece, type Neck, type PairShape } from "./drops";
import { fanAt, type BladePaths } from "./fan";
import { HEIGHT, WELL_ORDER, WELLS, WIDTH } from "./geometry";
import { GAPS, isJoined, MERGE_MAX, MERGE_MIN, MERGE_REST, readoutOf, REST_VALUE_TEXT, valueTextOf } from "./rig";

export interface SpotPlateLiveProps {
  base: React.ReactNode;
  tray: React.ReactNode;
  deck: React.ReactNode;
  back: React.ReactNode;
  front: React.ReactNode;
  hub: React.ReactNode;
}

const LABEL =
  "A bench spot plate with six channels, each holding a pair of glass drops, R30 and R22, at six gaps drawn to scale " +
  "against a ruler on the rim. To the right, beside a dropper bottle, a fan of six feeler blades, one per gap, turns on a pivot " +
  "over a protractor marked 0 to 48 px, with merge as the top blade. As it opens, each blade stops at its gap and that pair " +
  "runs together into one piece of glass.";
const CONTROL = "Merge threshold in pixels. Slide across, or use the arrow keys, Page Up and Page Down, Home and End, to open the fan.";

/** Time constants of the two cascaded easing stages, for direct input and for glides. */
const DIRECT = 0.15;
const GLIDE = 0.56;
/** Shapes not yet built that may be built in one frame; the rest catch up next frame. */
const BUILDS_PER_FRAME = 2;
/** The pointer's full range across the figure's width. */
const POINTER_FROM = 0.16;
const POINTER_TO = 0.84;

// The idle tour: glide open and hold, glide shut and hold, back to rest and hold (about 1.4 s of travel each).
const TOUR = [
  { to: MERGE_MAX, until: 1.4 + 2.4 },
  { to: MERGE_MIN, until: 1.4 + 2.4 + 1.4 + 2.2 },
  { to: MERGE_REST, until: 1.4 + 2.4 + 1.4 + 2.2 + 1.4 + 3.8 },
];
const TOUR_LOOP = TOUR[TOUR.length - 1]!.until;
const TOUR_DELAY = 1800;
const TOUR_RESUME = 4200;

function tourTarget(clock: number) {
  const t = clock % TOUR_LOOP;
  return (TOUR.find((leg) => t < leg.until) ?? TOUR[0]!).to;
}

const clamp = (value: number) => Math.min(MERGE_MAX, Math.max(MERGE_MIN, value));

const REST_FAN = fanAt(MERGE_REST);
const REST_SHAPES = WELLS.map((_, well) => pairShape(well, MERGE_REST));

const NECK_STOPS = [0, 0.18, 0.34, 0.5, 0.66, 0.82, 1].map((offset) => ({ offset, alpha: Math.sin(offset * Math.PI) ** 1.4 }));

function setPath(node: Element | null | undefined, d: string) {
  if (node && node.getAttribute("d") !== d) node.setAttribute("d", d);
}

function setFlag(node: Element | null | undefined, name: string, on: boolean) {
  if (!node || node.hasAttribute(name) === on) return;
  if (on) node.setAttribute(name, "");
  else node.removeAttribute(name);
}

/** Writes a solid's paths into a group built by `SolidNodes`, in the same order. */
function writeSolid(group: SVGGElement | null | undefined, paths: GlassPiece | BladePaths) {
  if (!group) return;
  const nodes = group.children;
  const extra = "shine" in paths ? paths.shine : paths.line;
  const list = [paths.fill, ...[0, 1, 2, 3].map((shade) => paths.shades[shade] ?? ""), paths.top, paths.crease, paths.bevel ?? "", extra, paths.outline];
  list.forEach((d, index) => setPath(nodes[index], d));
}

/** The DOM of a kit solid, with every path always present so frames can rewrite them. */
function SolidNodes({ paths, extra, extraClass, extraTone, tone }: { paths: { fill: string; shades: string[]; top: string; crease: string; bevel?: string; outline: string }; extra: string; extraClass: string; extraTone: "mid" | "lo" | "faint" | "hi"; tone: "hi" | "mid" }) {
  return (
    <>
      <path className="iso-fill" d={paths.fill} />
      {[0, 1, 2, 3].map((shade) => (
        <path key={shade} className="iso-shade" data-shade={shade} d={paths.shades[shade] ?? ""} />
      ))}
      <path className="iso-top" d={paths.top} />
      <path className="iso-line iso-crease" data-tone="lo" d={paths.crease} />
      <path className="iso-line iso-bevel" data-tone="lo" d={paths.bevel ?? ""} />
      <path className={`iso-line ${extraClass}`} data-tone={extraTone} d={extra} />
      <path className="iso-line iso-edge" data-tone={tone} d={paths.outline} />
    </>
  );
}

function neckGradient(node: Element | null | undefined, neck: Neck | undefined) {
  if (!node) return;
  const [x1, y1] = neck?.from ?? [0, 0];
  const [x2, y2] = neck?.to ?? [1, 0];
  node.setAttribute("x1", String(x1));
  node.setAttribute("y1", String(y1));
  node.setAttribute("x2", String(x2));
  node.setAttribute("y2", String(y2));
}

interface Plate {
  merge: number;
  stage: number;
  target: number;
  glide: boolean;
  drawnMerge: number;
  shapes: PairShape[];
  shapeAt: number[];
  touring: boolean;
  clock: number;
  hovered: boolean;
  focused: boolean;
  pointer: number | null;
  visible: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  value: number;
  text: string;
}

export function SpotPlateLive(props: SpotPlateLiveProps) {
  const { anchor, say } = useReadout<HTMLDivElement>();
  const visible = useInView(anchor);
  const halo = React.useRef<SVGPathElement>(null);
  const blades = React.useRef<(SVGGElement | null)[]>([]);
  const glass = React.useRef<(SVGGElement | null)[][]>(WELLS.map(() => []));
  const necks = React.useRef<(SVGPathElement | null)[][]>(WELLS.map(() => []));
  const gradients = React.useRef<(SVGLinearGradientElement | null)[][]>(WELLS.map(() => []));
  // Re-rendered only when a pair changes between one piece and two.
  const [, setPieces] = React.useState(() => REST_SHAPES.map((shape) => shape.pieces.length).join(""));

  const state = React.useRef<Plate>({
    merge: MERGE_REST,
    stage: MERGE_REST,
    target: MERGE_REST,
    glide: true,
    drawnMerge: MERGE_REST,
    shapes: [...REST_SHAPES],
    shapeAt: WELLS.map(() => quantise(MERGE_REST)),
    touring: false,
    clock: 0,
    hovered: false,
    focused: false,
    pointer: null,
    visible: false,
    timer: null,
    value: MERGE_REST,
    text: REST_VALUE_TEXT,
  });

  const writeWell = (well: number, shape: PairShape) => {
    shape.pieces.forEach((piece, index) => writeSolid(glass.current[well]?.[index], piece));
    [0, 1].forEach((side) => {
      setPath(necks.current[well]?.[side], shape.necks[side]?.d ?? "");
      neckGradient(gradients.current[well]?.[side], shape.necks[side]);
    });
  };

  /** Bring each well's glass to the merge shown; returns true while some shape still has to catch up. */
  const updateDrops = (merge: number) => {
    const s = state.current;
    const q = quantise(merge);
    let budget = BUILDS_PER_FRAME;
    let pending = false;
    let regrouped = false;
    const stale = WELLS.map((_, well) => well).sort((a, b) => Math.abs(s.shapeAt[b]! - q) - Math.abs(s.shapeAt[a]! - q));
    for (const well of stale) {
      if (s.shapeAt[well] === q) continue;
      if (!isBuilt(well, q)) {
        if (budget <= 0) {
          pending = true;
          continue;
        }
        budget--;
      }
      const shape = pairShape(well, q);
      const before = s.shapes[well]!;
      s.shapeAt[well] = q;
      if (shape === before) continue;
      s.shapes[well] = shape;
      if (shape.pieces.length !== before.pieces.length) regrouped = true;
      else writeWell(well, shape);
    }
    if (regrouped) setPieces(s.shapes.map((shape) => shape.pieces.length).join(""));
    return pending;
  };

  const drawFan = (merge: number) => {
    const fan = fanAt(merge);
    fan.blades.forEach((paths, index) => writeSolid(blades.current[index], paths));
    fan.out.forEach((out, index) => setFlag(blades.current[index], "data-out", out));
    setPath(halo.current, fan.halo);
  };

  const describe = (merge: number) => {
    const s = state.current;
    const root = anchor.current;
    say(readoutOf(merge));
    WELLS.forEach((well, index) => {
      if (s.shapes[index]!.pieces.length === 1) setFlag(glass.current[index]?.[0], "data-joined", isJoined(well.gap, merge));
    });
    if (!root) return;
    const value = Math.round(merge);
    if (value !== s.value) {
      s.value = value;
      root.setAttribute("aria-valuenow", String(value));
    }
    const text = valueTextOf(merge);
    if (text !== s.text) {
      s.text = text;
      root.setAttribute("aria-valuetext", text);
    }
  };

  const tick = (dt: number, calm: boolean) => {
    const s = state.current;
    if (s.touring && calm) s.touring = false;
    if (s.touring) {
      s.clock += dt;
      s.target = tourTarget(s.clock);
      s.glide = true;
    }
    const tau = s.glide ? GLIDE : DIRECT;
    s.stage = follow(s.stage, s.target, dt, tau / 2, calm);
    s.merge = follow(s.merge, s.stage, dt, tau / 2, calm);
    if (s.merge !== s.drawnMerge) {
      s.drawnMerge = s.merge;
      drawFan(s.merge);
    }
    const pending = updateDrops(s.merge);
    describe(s.merge);
    return s.touring || pending || s.merge !== s.target || s.stage !== s.target;
  };

  const kick = useLoop(tick, visible);

  const engaged = () => {
    const s = state.current;
    return s.hovered || s.focused || s.pointer !== null;
  };

  const clearTimer = () => {
    const s = state.current;
    if (s.timer !== null) clearTimeout(s.timer);
    s.timer = null;
  };

  const scheduleTour = (delay: number) => {
    clearTimer();
    const s = state.current;
    if (!s.visible || engaged() || asksForStillness()) return;
    s.timer = setTimeout(() => {
      s.timer = null;
      if (!s.visible || engaged() || asksForStillness()) return;
      s.touring = true;
      s.clock = 0;
      kick();
    }, delay);
  };

  const engage = () => {
    const s = state.current;
    clearTimer();
    if (s.touring) {
      s.touring = false;
      s.target = s.merge;
      s.stage = s.merge;
    }
  };

  const idle = () => {
    if (!engaged()) scheduleTour(TOUR_RESUME);
  };

  const aim = (value: number, glide = false) => {
    const s = state.current;
    s.target = clamp(Math.round(value));
    s.glide = glide;
    kick();
  };

  React.useEffect(() => {
    const s = state.current;
    s.visible = visible;
    if (visible) scheduleTour(TOUR_DELAY);
    else {
      clearTimer();
      if (s.touring) {
        s.touring = false;
        s.target = MERGE_REST;
      }
    }
    // scheduleTour only reads the state ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  React.useEffect(() => () => clearTimer(), []);

  const mergeAt = (event: React.PointerEvent) => {
    const svg = anchor.current?.querySelector("svg");
    if (!svg) return state.current.target;
    const box = svg.getBoundingClientRect();
    const share = (event.clientX - box.left) / (box.width || 1);
    return ((share - POINTER_FROM) / (POINTER_TO - POINTER_FROM)) * MERGE_MAX;
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const s = state.current;
    if (event.pointerType === "mouse") {
      if (!s.hovered) {
        s.hovered = true;
        engage();
      }
    } else if (s.pointer !== event.pointerId) return;
    aim(mergeAt(event));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    const s = state.current;
    event.currentTarget.setPointerCapture(event.pointerId);
    s.pointer = event.pointerId;
    engage();
    aim(mergeAt(event));
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const s = state.current;
    if (s.pointer !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    s.pointer = null;
    idle();
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    const s = state.current;
    if (event.pointerType !== "mouse" || !s.hovered) return;
    s.hovered = false;
    aim(MERGE_REST, true);
    idle();
  };

  const onFocus = () => {
    const s = state.current;
    s.focused = true;
    engage();
    aim(s.merge);
  };

  const onBlur = () => {
    state.current.focused = false;
    idle();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const s = state.current;
    const from = Math.round(s.target);
    const by = event.shiftKey ? 4 : 1;
    let next: number;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        next = from - by;
        break;
      case "ArrowRight":
      case "ArrowUp":
        next = from + by;
        break;
      case "PageDown":
        next = from - 8;
        break;
      case "PageUp":
        next = from + 8;
        break;
      case "Home":
        next = MERGE_MIN;
        break;
      case "End":
        next = MERGE_MAX;
        break;
      default:
        return;
    }
    event.preventDefault();
    engage();
    aim(next);
  };

  const shapes = state.current.shapes;
  const merge = state.current.merge;

  return (
    <div
      ref={anchor}
      className="ml"
      role="slider"
      tabIndex={0}
      aria-label={CONTROL}
      aria-valuemin={MERGE_MIN}
      aria-valuemax={MERGE_MAX}
      aria-valuenow={MERGE_REST}
      aria-valuetext={REST_VALUE_TEXT}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      <IsoFigure width={WIDTH} height={HEIGHT} label={LABEL}>
        {props.base}
        {props.tray}
        {WELL_ORDER.map((well) => {
          const shape = shapes[well]!;
          const whole = shape.pieces.length === 1;
          return (
            <g key={well}>
              {shape.pieces.map((piece, index) => (
                <g
                  key={whole ? "whole" : index ? "near" : "far"}
                  ref={(node) => {
                    glass.current[well]![index] = node;
                  }}
                  className="iso-solid ml-glass"
                  data-joined={whole && isJoined(WELLS[well]!.gap, merge) ? "" : undefined}
                >
                  <SolidNodes paths={piece} extra={piece.shine} extraClass="ml-shine" extraTone="mid" tone="hi" />
                </g>
              ))}
              <g className="ml-neck">
                <defs>
                  {[0, 1].map((side) => (
                    <linearGradient
                      key={side}
                      id={`ml-neck-${well}-${side}`}
                      ref={(node) => {
                        gradients.current[well]![side] = node;
                      }}
                      gradientUnits="userSpaceOnUse"
                      x1={shape.necks[side]?.from[0] ?? 0}
                      y1={shape.necks[side]?.from[1] ?? 0}
                      x2={shape.necks[side]?.to[0] ?? 1}
                      y2={shape.necks[side]?.to[1] ?? 0}
                    >
                      {NECK_STOPS.map(({ offset, alpha }) => (
                        <stop key={offset} offset={offset} stopOpacity={Number(alpha.toFixed(3))} style={{ stopColor: "var(--cutaway-lit)" }} />
                      ))}
                    </linearGradient>
                  ))}
                </defs>
                {[0, 1].map((side) => (
                  <path
                    key={side}
                    ref={(node) => {
                      necks.current[well]![side] = node;
                    }}
                    className="iso-line"
                    data-tone="lit"
                    style={{ stroke: `url(#ml-neck-${well}-${side})` }}
                    d={shape.necks[side]?.d ?? ""}
                  />
                ))}
              </g>
            </g>
          );
        })}
        {props.deck}
        <path ref={halo} className="iso-halo ml-fan-halo" d={REST_FAN.halo} />
        {props.back}
        {GAPS.map((gap, index) => (
          <g
            key={gap}
            ref={(node) => {
              blades.current[index] = node;
            }}
            className="iso-solid ml-blade"
            data-out={REST_FAN.out[index] ? "" : undefined}
          >
            <SolidNodes paths={REST_FAN.blades[index]!} extra={REST_FAN.blades[index]!.line} extraClass="ml-blade-line" extraTone="faint" tone="mid" />
          </g>
        ))}
        {props.front}
        <g
          ref={(node) => {
            blades.current[GAPS.length] = node;
          }}
          className="iso-solid ml-blade"
          data-lit=""
          data-lead=""
        >
          <SolidNodes paths={REST_FAN.blades[GAPS.length]!} extra={REST_FAN.blades[GAPS.length]!.line} extraClass="ml-blade-line" extraTone="lo" tone="hi" />
        </g>
        {props.hub}
      </IsoFigure>
    </div>
  );
}
