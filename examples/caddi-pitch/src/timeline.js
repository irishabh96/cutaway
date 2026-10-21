import gsap from 'gsap';
import { FOCUS, LOOP, BOM } from './config.js';
import { GLOBAL } from './shaders.js';

const ABOVE = 99;
export const SCAN_TOP = 4.2;
export const ROI_START = 28.2;

export function buildMaster({ rig, sheet, asm, split, map, sound, state }) {
  const tl = gsap.timeline({ paused: true, repeat: -1 });
  const A = asm.state;
  const parts = asm.list;
  const order = BOM.map((b) => b.id);

  const cue = (fn, at) => tl.call(() => state.live && fn(), null, at);
  const focus = (from, to, at, duration = 1.8) => {
    const a = FOCUS[from];
    const b = FOCUS[to];
    tl.fromTo(rig.goal,
      { x: a.target.x, y: a.target.y, z: a.target.z, zoom: a.zoom },
      { x: b.target.x, y: b.target.y, z: b.target.z, zoom: b.zoom, duration, ease: 'power3.inOut', immediateRender: false }, at);
  };
  const scan = (from, to, at, duration, ease = 'power1.inOut') =>
    tl.fromTo(GLOBAL.uScanY, { value: from }, { value: to, duration, ease, immediateRender: false }, at);
  const fade = (key, from, to, at, duration = 0.4) =>
    tl.fromTo(A, { [key]: from }, { [key]: to, duration, ease: 'power2.inOut', immediateRender: false }, at);

  tl.set(GLOBAL.uScanY, { value: ABOVE }, 0);
  tl.set(rig.goal, { x: FOCUS.sheet.target.x, y: FOCUS.sheet.target.y, z: FOCUS.sheet.target.z, zoom: FOCUS.sheet.zoom }, 0);

  tl.fromTo(sheet.uReveal, { value: 0 }, { value: 1, duration: 1.5, ease: 'power2.inOut' }, 0.1);
  cue(() => sound.uiClick(true), 0.1);
  tl.add(asm.riseTimeline(), 1.3);
  order.forEach((_, i) => cue(() => sound.snap(null, 0.6), 1.3 + i * 0.42 + 0.8));
  focus('sheet', 'rise', 1.4, 1.8);
  fade('scanner', 0, 1, 4.4, 0.3);
  tl.set(GLOBAL.uScanY, { value: SCAN_TOP }, 4.45);
  scan(SCAN_TOP, -0.1, 4.5, 2.6);
  cue(() => sound.scanSweep(2.6, true), 4.5);
  fade('ocr', 0, 1, 4.5, 0.2);
  fade('scanner', 1, 0, 7.1, 0.3);
  tl.add(asm.explodeTimeline(), 7.3);
  asm.explodeOrder(false).forEach((_, i) => cue(() => sound.snap(), 7.3 + i * 0.14 + 1.15));
  focus('rise', 'exploded', 7.2, 1.9);
  fade('ocr', 1, 0, 7.4, 0.3);
  fade('axes', 0, 1, 7.5, 0.8);
  fade('bom', 0, 1, 8.3, 0.3);

  fade('bom', 1, 0, 10.4, 0.3);
  fade('ghost', 0, 1, 10.5, 0.8);
  fade('axes', 1, 0.25, 10.5, 0.8);
  focus('exploded', 'split', 10.6, 1.6);
  tl.add(split.splitTimeline(), 11.2);
  cue(() => sound.snap(null, 0.8), 11.25);
  cue(() => sound.matchChord(), 11.2 + split.matchResolvesAt);

  tl.add(split.rejoinTimeline(), 19.4);
  cue(() => sound.snap(null, 0.8), 20.6);
  fade('ghost', 1, 0, 20.6, 0.8);
  tl.add(asm.explodeTimeline(true), 21.0);
  asm.explodeOrder(true).forEach((_, i) => cue(() => sound.snap(null, 0.7), 21.0 + i * 0.14 + 1.15));
  fade('axes', 0.25, 0, 21.0, 0.6);
  focus('split', 'datamap', 20.8, 2.0);
  tl.add(map.drawTimeline(), 22.6);
  map.links.forEach((_, i) => cue(() => sound.ping(i), 22.6 + map.connectAt(i)));

  focus('datamap', 'composer', 27.6, 1.8);
  fade('heat', 0, 1, 27.8, 1.2);
  cue(() => sound.scanSweep(1.2, true), 27.8);
  tl.fromTo(map.state, { focus: 0 }, { focus: 1, duration: 0.3 }, 27.8);
  tl.fromTo(map.state, { qcd: 0 }, { qcd: 1, duration: 2.0, ease: 'power2.out' }, ROI_START);
  tl.fromTo(state, { roi: 0 }, { roi: 1, duration: 2.4, ease: 'power2.out' }, ROI_START);
  cue(() => sound.confirm(), ROI_START + 2.0);

  tl.add(map.retractTimeline(), 32.4);
  tl.fromTo(map.state, { focus: 1, qcd: 1 }, { focus: 0, qcd: 0, duration: 0.4, immediateRender: false }, 32.6);
  fade('heat', 1, 0, 32.4, 0.6);
  fade('scanner', 0, 1, 32.9, 0.2);
  scan(-0.1, SCAN_TOP, 33.0, 1.0, 'power2.in');
  cue(() => sound.scanSweep(1.0, false), 33.0);
  fade('scanner', 1, 0, 34.0, 0.2);
  [...parts].reverse().forEach((p, i) => {
    tl.fromTo(p.state, { lift: 1 }, { lift: 0, duration: 0.8, ease: 'power3.inOut', immediateRender: false }, 34.0 + i * 0.12);
    tl.fromTo(p.state, { flat: 1 }, { flat: 0.001, duration: 0.7, ease: 'power3.in', immediateRender: false }, 34.1 + i * 0.12);
    cue(() => sound.snap(null, 0.35), 34.75 + i * 0.12);
  });
  focus('composer', 'sheet', 34.2, 1.6);
  scan(SCAN_TOP, ABOVE, 35.3, 0.01);
  tl.fromTo(sheet.uReveal, { value: 1 }, { value: 0, duration: 0.6, ease: 'power2.in', immediateRender: false }, 35.35);
  tl.set({}, {}, LOOP);
  return tl;
}
