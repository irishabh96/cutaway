import * as THREE from 'three';
import gsap from 'gsap';
import { PALETTE } from './config.js';
import { GLOBAL, linkShader } from './shaders.js';

const PACKETS = 18;
const SAMPLES = 256;
const DRAW_STAGGER = 0.45;
const DRAW_DURATION = 1.4;
const v = (x, y, z) => new THREE.Vector3(x, y, z);

const LINKS = [
  {
    id: 'quote', part: 'housing', feature: 'chamfer', normal: v(0.7, 0.7, 0), anchor: v(3.0, 6.2, -6.0), side: 'right',
    tag: 'CADDi QUOTE / COST REVIEW', color: PALETTE.emerald,
    rows: [['Supplier', 'Meikoh Precision'], ['Historical Unit Cost', '$14.20'], ['Lead Time', '12d']],
  },
  {
    id: 'pfmea', part: 'manifold', feature: 'pocket', normal: v(1, 0, 0), anchor: v(7.4, 1.2, -2.2), side: 'right',
    tag: 'CADDi PROCESS REVIEW / PFMEA', color: PALETTE.red, alert: true,
    rows: [['Quality Alert', 'Deep pocket L/D > 4 caused burr defect in Lot #402']],
  },
  {
    id: 'design', part: 'bolts', feature: 'tap', normal: v(0, 1, 0), anchor: v(-6.0, 6.0, 2.6), side: 'left',
    tag: 'CADDi DESIGN REVIEW', color: PALETTE.amber,
    rows: [['Standardize', 'M6 fastener across Series-B → reduces BOM SKUs by 18%']],
  },
  {
    id: 'composer', part: 'flange', feature: 'bore', normal: v(0, 1, 0), anchor: v(-2.2, 1.0, 6.8), side: 'left',
    tag: 'CADDi COMPOSER / ALM', color: PALETTE.blue, qcd: true, rows: [],
  },
];

const QCD = [
  { key: 'q', label: 'Quality', bar: 0.994, text: (k) => `${(99.4 * k).toFixed(1)}%` },
  { key: 'c', label: 'Cost', bar: 0.7, text: (k) => `-${(30 * k).toFixed(0)}%` },
  { key: 'd', label: 'Cycle Time', bar: 1.0, text: (k) => `${Math.max(1, 10 * k).toFixed(1)}x faster` },
];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _ahead = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);
const ZERO = new THREE.Vector3(0, 0, 0);
const FWD = new THREE.Vector3(0, 0, 1);

export class DataMap {
  constructor({ assembly, container, camera }) {
    this.asm = assembly;
    this.camera = camera;
    this.group = new THREE.Group();
    this.state = { qcd: 0, focus: 0 };
    this.lastQcd = -1;
    this.links = LINKS.map((spec) => this.createLink(spec));
    this.packets = this.createPackets();
    this.group.add(this.packets);
    this.links.forEach((l) => (l.card = this.createCard(l, container)));
  }

  connectAt(i) {
    return i * DRAW_STAGGER + DRAW_DURATION;
  }

  createLink(spec) {
    const p = this.asm.parts[spec.part];
    const f = p.features.find((x) => x.id === spec.feature);
    const start = f.local.clone().add(v(0, p.spec.compact, 0));
    const out = start.clone().addScaledVector(spec.normal.clone().normalize(), 1.0);
    const mid = out.clone().lerp(spec.anchor, 0.5).add(v(0, 1.4, 0));
    const curve = new THREE.CatmullRomCurve3([start, out, mid, spec.anchor], false, 'centripetal', 0.5);
    const uniforms = {
      uProgress: { value: 0 },
      uTail: { value: 0 },
      uColor: { value: new THREE.Color(PALETTE.red) },
      uTime: GLOBAL.uTime,
      uGlow: { value: 0 },
    };
    const segs = Math.round(curve.getLength() * 24);
    const core = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, 0.035, 8), new THREE.ShaderMaterial({ ...linkShader, uniforms }));
    const glow = new THREE.Mesh(
      new THREE.TubeGeometry(curve, segs, 0.13, 10),
      new THREE.ShaderMaterial({ ...linkShader, uniforms: { ...uniforms, uGlow: { value: 1 } }, transparent: true, depthWrite: false }),
    );
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 40), new THREE.MeshBasicMaterial({ color: PALETTE.red, side: THREE.DoubleSide }));
    ring.position.copy(start);
    ring.lookAt(start.clone().add(spec.normal));
    core.frustumCulled = glow.frustumCulled = false;
    this.group.add(glow, core, ring);
    return { ...spec, core, glow, ring, uniforms, state: { progress: 0, tail: 0, card: 0 }, samples: curve.getSpacedPoints(SAMPLES - 1), shown: null };
  }

  createPackets() {
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.075, 0.075, 0.16),
      new THREE.MeshBasicMaterial({ color: PALETTE.redHot }),
      PACKETS * LINKS.length,
    );
    mesh.frustumCulled = false;
    this.seeds = Array.from({ length: PACKETS * LINKS.length }, () => Math.random());
    return mesh;
  }

  createCard(link, container) {
    const el = document.createElement('article');
    el.className = `card ${link.side}${link.alert ? ' alert' : ''}${link.qcd ? ' qcd' : ''}`;
    el.style.setProperty('--accent', link.color);
    el.setAttribute('aria-hidden', 'true');
    const rows = link.rows.map(([k, val]) => `<div class="row"><span>${k}</span><b>${val}</b></div>`).join('');
    const qcd = link.qcd
      ? `<div class="qcd-body">
          <svg viewBox="-50 -50 100 100" class="radar" role="img" aria-label="QCD radar: quality, cost, delivery">
            <polygon class="grid" points="0,-40 34.6,20 -34.6,20"/><polygon class="grid" points="0,-20 17.3,10 -17.3,10"/>
            <line x1="0" y1="0" x2="0" y2="-40"/><line x1="0" y1="0" x2="34.6" y2="20"/><line x1="0" y1="0" x2="-34.6" y2="20"/>
            <polygon class="val" points="0,0 0,0 0,0"/>
            <text x="0" y="-43">Q</text><text x="40" y="29">C</text><text x="-40" y="29">D</text>
          </svg>
          <div class="bars">${QCD.map((q) => `<div><span>${q.label}</span><i><em data-k="${q.key}"></em></i><b data-v="${q.key}">—</b></div>`).join('')}</div>
        </div>`
      : '';
    el.innerHTML = `<i class="pin"></i><header>[${link.tag}]</header>${rows}${qcd}`;
    container.appendChild(el);
    if (link.qcd) {
      this.qcdEls = {
        poly: el.querySelector('.val'),
        bars: QCD.map((q) => el.querySelector(`[data-k="${q.key}"]`)),
        vals: QCD.map((q) => el.querySelector(`[data-v="${q.key}"]`)),
      };
    }
    return el;
  }

  drawTimeline() {
    const tl = gsap.timeline();
    this.links.forEach((l, i) => {
      tl.fromTo(l.state, { progress: 0 }, { progress: 1, duration: DRAW_DURATION, ease: 'power2.inOut' }, i * DRAW_STAGGER);
      tl.fromTo(l.state, { card: 0 }, { card: 1, duration: 0.5, ease: 'back.out(1.7)' }, this.connectAt(i) - 0.25);
    });
    return tl;
  }

  retractTimeline() {
    const tl = gsap.timeline();
    this.links.forEach((l, i) => {
      tl.fromTo(l.state, { card: 1 }, { card: 0, duration: 0.35, ease: 'power2.in', immediateRender: false }, i * 0.08);
      tl.fromTo(l.state, { tail: 0 }, { tail: 1, duration: 0.9, ease: 'power3.in', immediateRender: false }, 0.2 + i * 0.08);
      tl.fromTo(l.state, { progress: 1, tail: 1 }, { progress: 0, tail: 0, duration: 0.01, immediateRender: false }, 1.5);
    });
    return tl;
  }

  update(time, size) {
    this.links.forEach((l, li) => {
      l.uniforms.uProgress.value = l.state.progress;
      l.uniforms.uTail.value = l.state.tail;
      const vis = l.state.progress > l.state.tail + 0.001;
      l.core.visible = l.glow.visible = l.ring.visible = vis;
      l.ring.scale.setScalar(1 + 0.25 * Math.sin(time * 5 + li));
      for (let j = 0; j < PACKETS; j++) {
        const i = li * PACKETS + j;
        const s = (this.seeds[i] + time * 0.32) % 1;
        const live = vis && s < l.state.progress && s > l.state.tail;
        const f = s * (SAMPLES - 1);
        const k = Math.floor(f);
        _p.lerpVectors(l.samples[k], l.samples[Math.min(k + 1, SAMPLES - 1)], f - k);
        _ahead.copy(l.samples[Math.min(k + 2, SAMPLES - 1)]).sub(_p);
        if (_ahead.lengthSq() < 1e-8) _ahead.copy(FWD);
        _q.setFromUnitVectors(FWD, _ahead.normalize());
        _m.compose(_p, _q, live ? ONE : ZERO);
        this.packets.setMatrixAt(i, _m);
      }
      const c = l.card;
      _p.copy(l.anchor).project(this.camera);
      c.style.transform = `translate3d(${((_p.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-_p.y * 0.5 + 0.5) * size.height).toFixed(1)}px, 0)`;
      const shown = l.state.card > 0.01;
      c.style.opacity = l.state.card.toFixed(3);
      c.style.setProperty('--pop', (0.9 + 0.1 * l.state.card).toFixed(3));
      if (shown !== l.shown) {
        c.setAttribute('aria-hidden', String(!shown));
        c.style.visibility = shown ? 'visible' : 'hidden';
        l.shown = shown;
      }
      c.classList.toggle('focus', Boolean(l.qcd) && this.state.focus > 0.5);
      c.classList.toggle('dimmed', !l.qcd && this.state.focus > 0.5);
    });
    this.packets.instanceMatrix.needsUpdate = true;
    if (this.state.qcd !== this.lastQcd) this.updateQcd();
  }

  updateQcd() {
    const k = this.state.qcd;
    this.lastQcd = k;
    const r = 40;
    const vals = QCD.map((q) => q.bar * (0.25 + 0.75 * k));
    const pt = (a, val) => `${(Math.sin(a) * r * val).toFixed(1)},${(-Math.cos(a) * r * val).toFixed(1)}`;
    this.qcdEls.poly.setAttribute('points', vals.map((val, i) => pt((i * Math.PI * 2) / 3, val)).join(' '));
    QCD.forEach((q, i) => {
      this.qcdEls.bars[i].style.width = `${q.bar * k * 100}%`;
      this.qcdEls.vals[i].textContent = k < 0.01 ? '—' : q.text(k);
    });
  }
}
