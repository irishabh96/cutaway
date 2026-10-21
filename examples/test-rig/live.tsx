"use client";

// The one client component of the rig: refs, the loop, the tour, pointer and keys, aria and the readout.
// Static parts arrive as element props and are placed here in painter's order.
import * as React from "react";
import { IsoFigure } from "../../kit/react/draw";
import { asksForStillness, follow, useInView, useLoop, useReadout } from "../../kit/react/live";
import { frameOf, type Frame } from "./pose";
import { poseOf, readoutOf, REST_POSE, REST_VALUE_TEXT, restingMember, stateWordOf, step, valueTextOf, type Member } from "./rig";
import { GRAB_LIMIT, HEIGHT, HOME, HOVER_RANGE, LIFT, PULL_LIMIT, PULL_MOST, WIDTH, worldXAt } from "./view";

export interface RigLiveProps {
  base: React.ReactNode;
  rail: React.ReactNode;
  rider: React.ReactNode;
  probe: React.ReactNode;
  backFrame: React.ReactNode;
  shadow: React.ReactNode;
  rods: React.ReactNode;
  carriage: React.ReactNode;
  rest: React.ReactNode;
  plunger: React.ReactNode;
  frontFrame: React.ReactNode;
  dial: React.ReactNode;
  hub: React.ReactNode;
  finger: React.ReactNode;
  arm: React.ReactNode;
}

const LABEL =
  "A test rig for a glass button. A 120 by 32 glass capsule sits on a carriage that slides on two guide rods inside a frame, " +
  "held at rest by four coil springs, two at each end. A finger probe hangs from a carriage on a rail behind it: it comes down " +
  "to press, and the glass swells, then slides along the rail to pull, and the glass leans after it, giving less the further it goes. " +
  "A dial gauge at the end of the frame reads the lean. Let go and the springs bring it back, once past rest.";
const CONTROL =
  "Glass button on a test rig, pull in pixels. Space presses or lets go; the arrow keys move the finger and, while pressed, pull it.";

const FINGER_TAU = 0.09;
const LIFT_DOWN_TAU = 0.07;
const LIFT_UP_TAU = 0.16;
const KEY_STEP = 10;
const KEY_SHIFT = 3;

// The idle tour, in seconds within one loop: rest, press, pull 80, release, settle.
const TOUR = { loop: 7.6, press: 0.6, pullFrom: 1.2, pullTo: 2.4, release: 3.7, backFrom: 4.4, backTo: 5.6, pull: 80 };
const TOUR_DELAY = 1400;
const TOUR_RESUME = 3600;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const smooth = (t: number) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

function tourAt(time: number) {
  const t = time % TOUR.loop;
  if (t < TOUR.press) return { held: false, finger: HOME };
  if (t < TOUR.release) return { held: true, finger: HOME - TOUR.pull * smooth((t - TOUR.pullFrom) / (TOUR.pullTo - TOUR.pullFrom)) };
  return { held: false, finger: HOME - TOUR.pull * (1 - smooth((t - TOUR.backFrom) / (TOUR.backTo - TOUR.backFrom))) };
}

const REST_FRAME = frameOf(REST_POSE, { held: false, grab: 0, finger: HOME, lift: LIFT, rider: HOME });

interface Rig {
  member: Member;
  finger: number;
  fingerTarget: number;
  lift: number;
  grab: number;
  grabShare: number;
  pressing: boolean;
  pointer: number | null;
  tourHeld: boolean;
  touring: boolean;
  clock: number;
  hovered: boolean;
  focused: boolean;
  visible: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  shown: { held: boolean; lit: boolean; wire: boolean; rest: string; word: string; now: number; text: string };
}

function setPath(node: Element | null, d: string) {
  if (node && node.getAttribute("d") !== d) node.setAttribute("d", d);
}

function setTransform(node: Element | null, transform: string) {
  if (!node) return;
  if (transform) {
    if (node.getAttribute("transform") !== transform) node.setAttribute("transform", transform);
  } else node.removeAttribute("transform");
}

function setFlag(node: Element | null, name: string, on: boolean) {
  if (!node) return;
  if (on) node.setAttribute(name, "");
  else node.removeAttribute(name);
}

export function RigLive(props: RigLiveProps) {
  const { anchor, say } = useReadout<HTMLDivElement>();
  const visible = useInView(anchor);

  const carriage = React.useRef<SVGGElement>(null);
  const shadow = React.useRef<SVGGElement>(null);
  const plunger = React.useRef<SVGGElement>(null);
  const probe = React.useRef<SVGGElement>(null);
  const rider = React.useRef<SVGGElement>(null);
  const finger = React.useRef<SVGGElement>(null);
  const arm = React.useRef<SVGGElement>(null);
  const rest = React.useRef<SVGGElement>(null);
  const glass = React.useRef<SVGGElement>(null);
  const glassPaths = React.useRef<Record<string, SVGPathElement | null>>({});
  const coilsBack = React.useRef<(SVGPathElement | null)[]>([]);
  const coilsFront = React.useRef<(SVGPathElement | null)[]>([]);
  const needle = React.useRef<SVGPathElement>(null);
  const wire = React.useRef<SVGPathElement>(null);
  const wireEnds = React.useRef<(SVGCircleElement | null)[]>([]);

  const state = React.useRef<Rig>({
    member: restingMember(),
    finger: HOME,
    fingerTarget: HOME,
    lift: LIFT,
    grab: HOME,
    grabShare: 0,
    pressing: false,
    pointer: null,
    tourHeld: false,
    touring: false,
    clock: 0,
    hovered: false,
    focused: false,
    visible: false,
    timer: null,
    shown: { held: false, lit: false, wire: false, rest: "0", word: "At rest", now: 0, text: REST_VALUE_TEXT },
  });

  const draw = React.useCallback((frame: Frame, held: boolean) => {
    const s = state.current;
    const parts = glassPaths.current;
    setPath(parts.fill ?? null, frame.glass.fill);
    frame.glass.shades.forEach((d, index) => setPath(parts[`shade${index}`] ?? null, d));
    setPath(parts.top ?? null, frame.glass.top);
    setPath(parts.crease ?? null, frame.glass.crease);
    setPath(parts.bevel ?? null, frame.glass.bevel ?? "");
    setPath(parts.rim ?? null, frame.glass.rim);
    setPath(parts.shine ?? null, frame.glass.shine);
    setPath(parts.edge ?? null, frame.glass.outline);
    frame.coilsBack.forEach((d, index) => setPath(coilsBack.current[index] ?? null, d));
    frame.coilsFront.forEach((d, index) => setPath(coilsFront.current[index] ?? null, d));
    setTransform(carriage.current, frame.carriage);
    setTransform(shadow.current, frame.carriage);
    setTransform(plunger.current, frame.carriage);
    setTransform(probe.current, frame.probe);
    setTransform(arm.current, frame.probe);
    setTransform(finger.current, frame.finger);
    setTransform(rider.current, frame.rider);
    setPath(needle.current, frame.needle);
    setPath(wire.current, frame.wire.d);
    const ends = [frame.wire.from, frame.wire.to];
    wireEnds.current.forEach((end, index) => {
      if (!end) return;
      end.setAttribute("cx", String(ends[index]![0]));
      end.setAttribute("cy", String(ends[index]![1]));
    });
    if (frame.wire.shown !== s.shown.wire) {
      s.shown.wire = frame.wire.shown;
      wireEnds.current.forEach((end) => end?.setAttribute("opacity", frame.wire.shown ? "1" : "0"));
    }
    const fade = frame.restOpacity.toFixed(2);
    if (fade !== s.shown.rest) {
      s.shown.rest = fade;
      rest.current?.setAttribute("opacity", fade);
    }
    if (held !== s.shown.lit) {
      s.shown.lit = held;
      setFlag(glass.current, "data-lit", held);
    }
    if (s.pressing !== s.shown.held) {
      s.shown.held = s.pressing;
      setFlag(anchor.current, "data-held", s.pressing);
    }
  }, [anchor]);

  const describe = React.useCallback((word: string, text: string, now: number, settled: boolean) => {
    const s = state.current;
    const root = anchor.current;
    if (!root) return;
    if (now !== s.shown.now) {
      s.shown.now = now;
      root.setAttribute("aria-valuenow", String(now));
    }
    // Screen readers announce every change of a focused slider's text, so write it when the
    // state changes or the motion settles, not on every frame.
    if ((word !== s.shown.word || settled) && text !== s.shown.text) {
      s.shown.word = word;
      s.shown.text = text;
      root.setAttribute("aria-valuetext", text);
    }
  }, [anchor]);

  const pressAt = (x: number) => {
    const s = state.current;
    const grab = clamp(x, -GRAB_LIMIT, GRAB_LIMIT);
    const pose = poseOf(s.member);
    s.grab = grab;
    s.grabShare = clamp((grab - pose.centre) / pose.half[0], -1, 1);
    s.finger = grab;
    s.fingerTarget = grab;
  };

  const tick = (dt: number, calm: boolean) => {
    const s = state.current;
    if (s.touring && calm) stopTour(false);
    if (s.touring) {
      s.clock += dt;
      const cue = tourAt(s.clock);
      if (cue.held && !s.tourHeld) {
        pressAt(HOME);
        s.tourHeld = true;
      } else if (!cue.held) s.tourHeld = false;
      s.fingerTarget = cue.finger;
    }
    const held = s.pressing || s.tourHeld;
    s.finger = follow(s.finger, s.fingerTarget, dt, FINGER_TAU, calm);
    const liftTarget = held ? 0 : LIFT;
    s.lift = follow(s.lift, liftTarget, dt, liftTarget < s.lift ? LIFT_DOWN_TAU : LIFT_UP_TAU, calm);
    const pull = held ? s.finger - s.grab : 0;
    const settled = step(s.member, held, pull, dt, calm);
    const pose = poseOf(s.member);
    draw(frameOf(pose, { held, grab: s.grabShare, finger: s.finger, lift: s.lift, rider: held ? s.grab : s.finger }), held);
    say(readoutOf(pose));
    describe(stateWordOf(s.member, held), valueTextOf(pose, stateWordOf(s.member, held), pull), Math.round(pull), settled);
    return s.touring || !settled || s.finger !== s.fingerTarget || s.lift !== liftTarget;
  };

  const kick = useLoop(tick, visible);

  const engaged = () => {
    const s = state.current;
    return s.hovered || s.focused || s.pressing;
  };

  const clearTimer = () => {
    const s = state.current;
    if (s.timer !== null) clearTimeout(s.timer);
    s.timer = null;
  };

  function stopTour(sendHome: boolean) {
    const s = state.current;
    if (!s.touring) return;
    s.touring = false;
    s.tourHeld = false;
    s.fingerTarget = sendHome ? HOME : s.finger;
  }

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
    clearTimer();
    stopTour(false);
    kick();
  };

  const idle = () => {
    if (!engaged()) scheduleTour(TOUR_RESUME);
    kick();
  };

  const release = () => {
    const s = state.current;
    s.pressing = false;
    s.fingerTarget = clamp(s.fingerTarget, HOVER_RANGE[0], HOVER_RANGE[1]);
  };

  React.useEffect(() => {
    const s = state.current;
    s.visible = visible;
    if (visible) scheduleTour(TOUR_DELAY);
    else {
      clearTimer();
      stopTour(true);
    }
    // scheduleTour and stopTour only read the state ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  React.useEffect(() => () => clearTimer(), []);

  const worldX = (event: React.PointerEvent) => {
    const svg = anchor.current?.querySelector("svg");
    if (!svg) return HOME;
    const box = svg.getBoundingClientRect();
    return worldXAt(((event.clientX - box.left) / (box.width || 1)) * WIDTH);
  };

  const onPointerEnter = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    state.current.hovered = true;
    engage();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const s = state.current;
    if (s.pointer === event.pointerId) {
      s.fingerTarget = clamp(worldX(event), -PULL_LIMIT, PULL_LIMIT);
      kick();
      return;
    }
    if (event.pointerType !== "mouse" || s.pressing) return;
    if (!s.hovered) {
      s.hovered = true;
      engage();
    }
    s.fingerTarget = clamp(worldX(event), HOVER_RANGE[0], HOVER_RANGE[1]);
    kick();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const s = state.current;
    event.currentTarget.setPointerCapture(event.pointerId);
    s.pointer = event.pointerId;
    s.pressing = true;
    engage();
    pressAt(worldX(event));
    kick();
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const s = state.current;
    if (s.pointer !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    s.pointer = null;
    release();
    if (event.pointerType !== "mouse") s.hovered = false;
    idle();
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    const s = state.current;
    if (event.pointerType !== "mouse" || s.pointer !== null) return;
    s.hovered = false;
    if (!s.pressing) s.fingerTarget = HOME;
    idle();
  };

  const onFocus = () => {
    state.current.focused = true;
    engage();
  };

  const onBlur = () => {
    const s = state.current;
    s.focused = false;
    if (s.pressing && s.pointer === null) release();
    idle();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const s = state.current;
    const range: readonly [number, number] = s.pressing ? [-PULL_LIMIT, PULL_LIMIT] : HOVER_RANGE;
    const by = KEY_STEP * (event.shiftKey ? KEY_SHIFT : 1);
    switch (event.key) {
      case " ":
      case "Enter":
        event.preventDefault();
        if (event.repeat) return;
        if (s.pressing) release();
        else {
          s.pressing = true;
          pressAt(s.finger);
        }
        break;
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        s.fingerTarget = clamp(s.fingerTarget - by, range[0], range[1]);
        break;
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        s.fingerTarget = clamp(s.fingerTarget + by, range[0], range[1]);
        break;
      case "Home":
        event.preventDefault();
        s.fingerTarget = range[0];
        break;
      case "End":
        event.preventDefault();
        s.fingerTarget = range[1];
        break;
      case "Escape":
        if (!s.pressing) return;
        event.preventDefault();
        release();
        break;
      default:
        return;
    }
    engage();
  };

  return (
    <div
      ref={anchor}
      className="ms"
      role="slider"
      tabIndex={0}
      aria-label={CONTROL}
      aria-valuemin={-PULL_MOST}
      aria-valuemax={PULL_MOST}
      aria-valuenow={0}
      aria-valuetext={REST_VALUE_TEXT}
      onPointerEnter={onPointerEnter}
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
        {props.rail}
        <g ref={rider}>{props.rider}</g>
        <g ref={probe}>{props.probe}</g>
        {props.backFrame}
        <g ref={shadow}>{props.shadow}</g>
        {REST_FRAME.coilsBack.map((d, index) => (
          <path key={`back-${index}`} ref={(node) => { coilsBack.current[index] = node; }} className="iso-line" data-tone="lo" d={d} />
        ))}
        {props.rods}
        {[0, 1].map((index) => (
          <path key={`left-${index}`} ref={(node) => { coilsFront.current[index] = node; }} className="iso-line ms-coil" data-tone="mid" d={REST_FRAME.coilsFront[index]} />
        ))}
        <g ref={carriage}>{props.carriage}</g>
        <g ref={glass} className="iso-solid ms-glass">
          <path ref={(node) => { glassPaths.current.fill = node; }} className="iso-fill" d={REST_FRAME.glass.fill} />
          {REST_FRAME.glass.shades.map((d, index) => (
            <path key={index} ref={(node) => { glassPaths.current[`shade${index}`] = node; }} className="iso-shade" data-shade={index} d={d} />
          ))}
          <path ref={(node) => { glassPaths.current.top = node; }} className="iso-top" d={REST_FRAME.glass.top} />
          <path ref={(node) => { glassPaths.current.crease = node; }} className="iso-line iso-crease" data-tone="lo" d={REST_FRAME.glass.crease} />
          <path ref={(node) => { glassPaths.current.bevel = node; }} className="iso-line iso-bevel" data-tone="lo" d={REST_FRAME.glass.bevel ?? ""} />
          <path ref={(node) => { glassPaths.current.rim = node; }} className="iso-line ms-rim" data-tone="faint" d={REST_FRAME.glass.rim} />
          <path ref={(node) => { glassPaths.current.shine = node; }} className="iso-line ms-shine" data-tone="hi" d={REST_FRAME.glass.shine} />
          <path ref={(node) => { glassPaths.current.edge = node; }} className="iso-line iso-edge" data-tone="hi" d={REST_FRAME.glass.outline} />
        </g>
        <g ref={rest} opacity={0}>{props.rest}</g>
        <g className="iso-wire ms-pull" data-tone="hi">
          <path ref={wire} className="iso-line" data-tone="lit" d="" />
          {[REST_FRAME.wire.from, REST_FRAME.wire.to].map(([cx, cy], index) => (
            <circle key={index} ref={(node) => { wireEnds.current[index] = node; }} className="iso-wire-end" cx={cx} cy={cy} r={1.2} opacity={0} />
          ))}
        </g>
        <path ref={(node) => { coilsFront.current[2] = node; }} className="iso-line ms-coil" data-tone="mid" d={REST_FRAME.coilsFront[2]} />
        <g ref={plunger}>{props.plunger}</g>
        <path ref={(node) => { coilsFront.current[3] = node; }} className="iso-line ms-coil" data-tone="mid" d={REST_FRAME.coilsFront[3]} />
        {props.frontFrame}
        {props.dial}
        <path ref={needle} className="iso-line ms-needle" data-tone="hi" d={REST_FRAME.needle} />
        {props.hub}
        <g ref={finger}>{props.finger}</g>
        <g ref={arm}>{props.arm}</g>
      </IsoFigure>
    </div>
  );
}
