import * as THREE from 'three';
import gsap from 'gsap';
import { MM } from './config.js';
import { HOUSING_PROFILE } from './cadGeometry.js';
import { DimensionLine } from './dimension.js';

const SEP = 3.2;
const BORE_R = HOUSING_PROFILE[0].x;
const LIP_R = HOUSING_PROFILE[1].x;
const TOP = HOUSING_PROFILE[5].y;
const MATCH_AT = 1.8;
const MATCH_DUR = 2.2;
const TICK_MM = 2;

export class SplitComparison {
  constructor({ assembly, labels, scene, onTick = () => {} }) {
    this.asm = assembly;
    this.housing = assembly.parts.housing;
    this.onTick = onTick;
    this.lastStep = 0;
    this.state = { sep: 0, dims: 0, match: 0 };
    this.matchResolvesAt = MATCH_AT + MATCH_DUR;
    this.bore = new DimensionLine({ offset: new THREE.Vector3(0, 1, 0), extent: 0, arrow: 0.14, dashed: true });
    this.gap = new DimensionLine({ offset: new THREE.Vector3(0, 1, 0), extent: 0.55, arrow: 0.14, dashed: true });
    this.lip = new DimensionLine({ offset: new THREE.Vector3(0, 0, 1), extent: 2.0, arrow: 0.16, dashed: true });
    scene.add(this.bore.group, this.gap.group, this.lip.group);
    this.registerLabels(labels);
  }

  registerLabels(labels) {
    const tmp = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const on = () => this.state.dims > 0.5;
    const sepMm = () => this.state.sep * MM;
    labels.add({
      cls: 'center gdt',
      anchor: () => this.bore.midpoint(mid).add(tmp.set(0, -0.32, 0)),
      visible: on,
      text: () =>
        `<b>⌀ 48.00mm</b> ±0.01 <span class="fcf" aria-label="position tolerance 0.02 to datums A and B"><i>⌖</i><i>0.02</i><i>A</i><i>B</i></span><small>bore · split Δd ${sepMm().toFixed(1)}mm</small>`,
    });
    labels.add({ cls: 'center dimension', anchor: () => this.gap.midpoint(mid), visible: on, text: () => `Δd ${sepMm().toFixed(2)}` });
    labels.add({ cls: 'center dimension', anchor: () => this.lip.midpoint(mid), visible: on, text: () => `${(LIP_R * 2 * MM + sepMm()).toFixed(1)}` });
    labels.add({
      cls: 'center badge',
      anchor: () => this.housing.group.localToWorld(tmp.set(0, 3.9, 0)),
      visible: () => this.state.match > 0.02,
      text: () => {
        const m = this.state.match;
        const current = 14.2 + (21.5 - 14.2) * m;
        const save = (1 - 14.2 / current) * 100;
        return `<span>CADDi EXPLORER MATCH: <b>DWG #9910-B</b></span><span>SIMILARITY: <b class="g">${(98.4 * m).toFixed(1)}%</b></span><span>QUOTE BENCHMARK: <b>$14.20</b> vs <b>$${current.toFixed(2)}</b> <b class="g">(SAVE ${save.toFixed(0)}%)</b></span>`;
      },
    });
    labels.add({
      cls: 'left half-tag',
      object: this.asm.leftHalf,
      anchor: () => tmp.set(-LIP_R, 0.12, 1.0),
      visible: on,
      text: () => `<b class="b">NEW ENGINEERING DRAWING · REV.D</b><br><span class="dim">CD-2026-8841 · clay / BREP preview</span>`,
    });
    labels.add({
      cls: 'half-tag',
      object: this.asm.rightHalf,
      anchor: () => tmp.set(LIP_R, 0.12, -1.0),
      visible: on,
      text: () =>
        `<b class="r">AI-MATCHED HISTORICAL PART</b><br><span class="dim">${(98.4 * this.state.match).toFixed(1)}% geometry match · cost heatmap</span><span class="legend"><i></i>std ··· tight tol.</span>`,
    });
    labels.add({ cls: 'datum', object: this.asm.leftHalf, anchor: () => tmp.set(-LIP_R, 0.02, 0), visible: on, text: () => '<i>A</i>' });
    labels.add({ cls: 'datum', object: this.asm.leftHalf, anchor: () => tmp.set(-BORE_R, 1.4, 0), visible: on, text: () => '<i>B</i>' });
  }

  splitTimeline() {
    const s = this.state;
    const a = this.asm;
    const tl = gsap.timeline();
    tl.fromTo(a.housingFull, { visible: true }, { visible: false, duration: 0.01 }, 0);
    tl.fromTo(a.halves, { visible: false }, { visible: true, duration: 0.01 }, 0);
    tl.fromTo(s, { sep: 0 }, { sep: SEP, duration: 1.6, ease: 'power3.inOut' }, 0.2);
    tl.fromTo(s, { dims: 0 }, { dims: 1, duration: 0.4 }, 0.3);
    tl.fromTo(a.leftU.uClay, { value: 0 }, { value: 1, duration: 1.2, ease: 'power2.inOut' }, 1.2);
    tl.fromTo(a.rightU.uHeat, { value: 0 }, { value: 1, duration: 1.4, ease: 'power2.inOut' }, 1.2);
    tl.fromTo(s, { match: 0 }, { match: 1, duration: MATCH_DUR, ease: 'power2.out' }, MATCH_AT);
    return tl;
  }

  rejoinTimeline() {
    const s = this.state;
    const a = this.asm;
    const tl = gsap.timeline();
    tl.fromTo(s, { match: 1, dims: 1 }, { match: 0, dims: 0, duration: 0.4, immediateRender: false }, 0);
    tl.fromTo(a.leftU.uClay, { value: 1 }, { value: 0, duration: 0.8, immediateRender: false }, 0);
    tl.fromTo(a.rightU.uHeat, { value: 1 }, { value: 0, duration: 0.8, immediateRender: false }, 0);
    tl.fromTo(s, { sep: SEP }, { sep: 0, duration: 1.2, ease: 'power3.inOut', immediateRender: false }, 0.2);
    tl.fromTo(a.housingFull, { visible: false }, { visible: true, duration: 0.01, immediateRender: false }, 1.4);
    tl.fromTo(a.halves, { visible: true }, { visible: false, duration: 0.01, immediateRender: false }, 1.4);
    return tl;
  }

  update() {
    const a = this.asm;
    const half = this.state.sep / 2;
    a.leftHalf.position.x = -half;
    a.rightHalf.position.x = half;

    const step = Math.floor((this.state.sep * MM) / TICK_MM);
    if (step !== this.lastStep) {
      if (this.state.dims > 0.1) this.onTick();
      this.lastStep = step;
    }

    const g = this.housing.group;
    const w = (x, y, z, v) => g.localToWorld(v.set(x, y, z));
    w(-BORE_R - half, 0.9, 0, this.bore.p1);
    w(BORE_R + half, 0.9, 0, this.bore.p2);
    w(-half, TOP, 1.1, this.gap.p1);
    w(half, TOP, 1.1, this.gap.p2);
    w(-LIP_R - half, 0.0, 0, this.lip.p1);
    w(LIP_R + half, 0.0, 0, this.lip.p2);
    for (const d of [this.bore, this.gap, this.lip]) {
      d.opacity = this.state.dims;
      d.update();
    }
  }
}
