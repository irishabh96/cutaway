import * as THREE from 'three';
import gsap from 'gsap';
import { PALETTE, BOM } from './config.js';
import { GLOBAL, patchPartMaterial, edgeShader, pointShader, sectionShader, scannerShader } from './shaders.js';
import { brushedTexture } from './textures.js';
import {
  manifoldGeometry, portGeometry, housingGeometry, housingSectionGeometry, boltGeometry,
  bearingGeometry, flangeGeometry, shaftGeometry, sampleSurface, heatOf, MANIFOLD,
} from './cadGeometry.js';

const brushed = brushedTexture();

const FINISH = {
  aluminium: { color: PALETTE.aluminium, metalness: 0.85, roughness: 0.42 },
  stainless: { color: PALETTE.stainless, metalness: 0.9, roughness: 0.3 },
  steel: { color: PALETTE.steel, metalness: 0.92, roughness: 0.26 },
  oxide: { color: PALETTE.blackOxide, metalness: 0.7, roughness: 0.45 },
  bearing: { color: '#D3D7DD', metalness: 0.95, roughness: 0.18 },
  port: { color: '#1E293B', metalness: 0.4, roughness: 0.6 },
};

function partUniforms() {
  return {
    uHeat: { value: 0 },
    uClay: { value: 0 },
    uGhost: { value: 0 },
    uHighlight: { value: 0 },
  };
}

class Part {
  constructor(spec) {
    this.spec = spec;
    this.u = partUniforms();
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);
    this.meshes = [];
    this.edgeMats = [];
    this.pointMats = [];
    this.state = { lift: 0, flat: 0.001, explode: 0 };
    this.features = [];
  }

  material(finish, u = this.u, extra = {}) {
    const f = FINISH[finish];
    const m = new THREE.MeshStandardMaterial({ ...f, map: brushed, roughnessMap: brushed, ...extra });
    patchPartMaterial(m, u);
    return m;
  }

  add(geo, finish, { parent = this.body, transform, points = 900, u = this.u, mat, edgeAngle = 28 } = {}) {
    const holder = new THREE.Group();
    transform?.(holder);
    const mesh = new THREE.Mesh(geo, mat || this.material(finish, u));
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.part = this;
    const edgeMat = new THREE.ShaderMaterial({
      ...edgeShader,
      uniforms: {
        uScanY: GLOBAL.uScanY,
        uRaw: { value: new THREE.Color(PALETTE.blue) },
        uDone: { value: new THREE.Color(PALETTE.ink) },
        uHot: { value: new THREE.Color(PALETTE.redHot) },
        uHighlight: u.uHighlight,
        uOpacity: { value: 1 },
      },
      transparent: true,
    });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, edgeAngle), edgeMat);
    holder.add(mesh, edges);
    if (points > 0) {
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(sampleSurface(geo, points), 3));
      const rand = new Float32Array(points).map(() => Math.random());
      pg.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
      const pm = new THREE.ShaderMaterial({
        ...pointShader,
        uniforms: { uScanY: GLOBAL.uScanY, uTime: GLOBAL.uTime, uPixelRatio: GLOBAL.uPixelRatio, uOpacity: { value: 1 }, uColor: { value: new THREE.Color(PALETTE.blue) } },
        transparent: true,
        depthWrite: false,
      });
      holder.add(new THREE.Points(pg, pm));
      this.pointMats.push(pm);
    }
    parent.add(holder);
    this.meshes.push(mesh);
    this.edgeMats.push(edgeMat);
    return { holder, mesh, edges };
  }

  setGhost(v) {
    this.u.uGhost.value = v;
    this.edgeMats.forEach((m) => (m.uniforms.uOpacity.value = 1 - v * 0.8));
    this.pointMats.forEach((m) => (m.uniforms.uOpacity.value = 1 - v));
  }

  get y() {
    const s = this.spec;
    return s.compact * this.state.lift + (s.exploded - s.compact) * this.state.explode;
  }

  apply() {
    this.group.position.y = this.y;
    this.group.scale.y = Math.max(this.state.flat, 0.001);
  }
}

export class Assembly {
  constructor({ labels }) {
    this.group = new THREE.Group();
    this.state = { ocr: 0, bom: 0, axes: 0, scanner: 0, heat: 0, ghost: 0 };
    this.parts = {};
    BOM.forEach((spec) => {
      const part = new Part(spec);
      this.parts[spec.id] = part;
      this.group.add(part.group);
    });
    this.list = Object.values(this.parts);
    this.buildManifold();
    this.buildHousing();
    this.buildBolts();
    this.parts.bearing.add(bearingGeometry(), 'bearing', { points: 700 });
    this.parts.flange.add(flangeGeometry(), 'steel', { points: 900 });
    this.parts.flange.features = [{ id: 'bore', label: 'CENTRE BORE Ø31 H8', local: new THREE.Vector3(0.0, 0.46, -0.45) }];
    this.parts.shaft.add(shaftGeometry(), 'stainless', { points: 500 });
    this.buildAxes();
    this.buildScanner();
    this.registerLabels(labels);
    const box = new THREE.Box3();
    this.list.forEach((p) => {
      box.setFromObject(p.body);
      p.midY = (box.min.y + box.max.y) / 2;
      p.apply();
    });
  }

  buildManifold() {
    const m = this.parts.manifold;
    m.add(manifoldGeometry(), 'aluminium', { points: 1600 });
    const port = portGeometry();
    const disc = new THREE.CircleGeometry(0.19, 40).toNonIndexed();
    disc.setAttribute('heat', new THREE.BufferAttribute(new Float32Array(disc.attributes.position.count).fill(heatOf('manifold', 'port')), 1));
    const ports = [
      { id: 'oring', at: [0.9, 0.7, MANIFOLD.d / 2], rot: (g) => g.rotation.set(Math.PI / 2, 0, 0) },
      { id: 'pocket', at: [MANIFOLD.w / 2, 0.7, -0.2], rot: (g) => g.rotation.set(0, 0, -Math.PI / 2) },
      { id: 'aux', at: [-0.9, 0.7, MANIFOLD.d / 2], rot: (g) => g.rotation.set(Math.PI / 2, 0, 0) },
    ];
    ports.forEach((p) => {
      const transform = (g) => {
        g.position.set(...p.at);
        p.rot(g);
      };
      m.add(port, 'stainless', { points: 120, transform });
      const { holder } = m.add(disc, 'port', { points: 0, transform });
      holder.children[0].rotation.x = -Math.PI / 2;
      holder.children[1].rotation.x = -Math.PI / 2;
      holder.children[0].position.y = holder.children[1].position.y = 0.032;
    });
    m.features = [
      { id: 'milled', label: 'MILLED FACE · Ra 1.6', local: new THREE.Vector3(1.6, MANIFOLD.h, -1.25) },
      { id: 'pocket', label: 'DEEP POCKET · L/D 4.6', local: new THREE.Vector3(MANIFOLD.w / 2 + 0.05, 0.7, -0.2) },
      { id: 'oring', label: 'O-RING GROOVE · AS568-014', local: new THREE.Vector3(0.9, 0.7, MANIFOLD.d / 2 + 0.05) },
    ];
  }

  buildHousing() {
    const h = this.parts.housing;
    this.housingFull = h.add(housingGeometry(), 'stainless', { points: 1800 }).holder;

    this.halves = new THREE.Group();
    this.halves.visible = false;
    h.body.add(this.halves);
    this.leftU = { ...partUniforms(), uHighlight: h.u.uHighlight };
    this.rightU = { ...partUniforms(), uHighlight: h.u.uHighlight };
    const leftMat = h.material('stainless', this.leftU, { transparent: true });
    const section = () =>
      new THREE.Mesh(
        housingSectionGeometry(),
        new THREE.ShaderMaterial({
          ...sectionShader,
          uniforms: { uHatch: { value: new THREE.Color(PALETTE.blue) }, uBase: { value: new THREE.Color(PALETTE.panel) } },
          side: THREE.DoubleSide,
        }),
      );
    this.leftHalf = new THREE.Group();
    this.rightHalf = new THREE.Group();
    h.add(housingGeometry(Math.PI, Math.PI), 'stainless', { parent: this.leftHalf, points: 0, u: this.leftU, mat: leftMat });
    h.add(housingGeometry(0, Math.PI), 'stainless', { parent: this.rightHalf, points: 0, u: this.rightU });
    const iso = [];
    for (const [r, y] of [[1.12, 0.6], [1.12, 1.0], [1.12, 1.35], [1.62, 0.12]]) {
      for (let i = 0; i < 36; i++) {
        const a0 = Math.PI + (i / 36) * Math.PI;
        const a1 = Math.PI + ((i + 1) / 36) * Math.PI;
        iso.push(Math.sin(a0) * r, y, Math.cos(a0) * r, Math.sin(a1) * r, y, Math.cos(a1) * r);
      }
    }
    for (let i = 1; i < 6; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      iso.push(Math.sin(a) * 1.12, 0.25, Math.cos(a) * 1.12, Math.sin(a) * 1.12, 1.6, Math.cos(a) * 1.12);
    }
    const isoGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(iso, 3));
    this.isoLines = new THREE.LineSegments(isoGeo, new THREE.LineBasicMaterial({ color: PALETTE.blue, transparent: true, opacity: 0 }));
    this.leftHalf.add(this.isoLines, section());
    this.rightHalf.add(section());
    this.halves.add(this.leftHalf, this.rightHalf);
    h.features = [
      { id: 'bore', label: 'BORE Ø48 H7', local: new THREE.Vector3(0, 1.0, 0) },
      { id: 'chamfer', label: 'CHAMFER 0.5×45°', local: new THREE.Vector3(0.75, 1.72, 0.75) },
    ];
  }

  buildBolts() {
    const b = this.parts.bolts;
    const geo = boltGeometry();
    [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(([x, z]) => b.add(geo, 'oxide', { points: 90, edgeAngle: 85, transform: (g) => g.position.set(x, 0, z) }));
    b.features = [{ id: 'tap', label: '4× M6×1.0 ▽12', local: new THREE.Vector3(1, 0.14, 1) }];
  }

  buildAxes() {
    const mk = (x, z, top) => {
      const l = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, -0.05, z), new THREE.Vector3(x, top, z)]),
        new THREE.LineDashedMaterial({ color: PALETTE.blue, dashSize: 0.32, gapSize: 0.1, transparent: true, opacity: 0 }),
      );
      l.computeLineDistances();
      return l;
    };
    this.axes = [mk(0, 0, 11.2), ...[[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([x, z]) => mk(x, z, 4.3))];
    this.axes.forEach((a) => this.group.add(a));
  }

  buildScanner() {
    this.scannerUniforms = { uColor: { value: new THREE.Color(PALETTE.cyan) }, uTime: GLOBAL.uTime, uOpacity: { value: 0 } };
    this.scanner = new THREE.Mesh(
      new THREE.PlaneGeometry(6.8, 6.8),
      new THREE.ShaderMaterial({ ...scannerShader, uniforms: this.scannerUniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.scanner.rotation.x = -Math.PI / 2;
    this.scanner.renderOrder = 2;
    this.group.add(this.scanner);
  }

  registerLabels(labels) {
    const tmp = new THREE.Vector3();
    const tags = [
      { part: 'manifold', text: 'Ra 1.6', at: new THREE.Vector3(-1.5, 1.4, 1.1), conf: 0.99 },
      { part: 'bolts', text: '4x M6x1.0', at: new THREE.Vector3(1, 0.14, 1), conf: 0.98 },
      { part: 'housing', text: 'CHAMFER 0.5x45°', at: new THREE.Vector3(-0.75, 1.72, 0.75), conf: 0.97 },
      { part: 'housing', text: 'Ø48.00 H7', at: new THREE.Vector3(0, 1.2, 0.6), conf: 0.99 },
      { part: 'flange', text: '6x SLOT 8.0', at: new THREE.Vector3(0.8, 0.26, -0.5), conf: 0.96 },
      { part: 'bearing', text: '6206-2RS', at: new THREE.Vector3(-0.7, 0.4, 0), conf: 0.95 },
      { part: 'manifold', text: 'G1/4 PORT', at: new THREE.Vector3(2.1, 0.7, -0.2), conf: 0.94 },
      { part: 'housing', text: 'SUS304', at: new THREE.Vector3(1.0, 0.9, -0.6), conf: 0.99 },
    ];
    tags.forEach((t, i) => {
      const part = this.parts[t.part];
      labels.add({
        cls: `ocr ${i % 2 ? 'left' : ''}`,
        object: part.group,
        anchor: () => tmp.copy(t.at),
        visible: () => {
          if (this.state.ocr < 0.5) return false;
          tmp.copy(t.at);
          part.group.localToWorld(tmp);
          return GLOBAL.uScanY.value < tmp.y;
        },
        text: () => `<span class="ocr-box">${t.text}</span><span class="conf">OCR ${t.conf.toFixed(2)}</span>`,
      });
    });
    this.list.forEach((p, i) => {
      const side = i % 2 ? -1 : 1;
      const { r, h } = p.spec.balloon;
      labels.add({
        cls: `balloon ${side < 0 ? 'left' : ''}`,
        object: p.group,
        anchor: () => tmp.set(side * r * 0.7071, h, -side * r * 0.7071),
        visible: () => this.state.bom > 0.5 && p.u.uGhost.value < 0.5,
        text: () => `<i>${p.spec.item}</i>${p.spec.name}<br><span class="dim">${p.spec.pn} · ${p.spec.mat} · QTY ${p.spec.qty}</span>`,
      });
    });
  }

  riseTimeline() {
    const tl = gsap.timeline();
    this.list.forEach((part, i) => {
      const s = part.state;
      tl.fromTo(s, { lift: 0 }, { lift: 1, duration: 1.0, ease: 'power3.inOut' }, i * 0.42);
      tl.fromTo(s, { flat: 0.001 }, { flat: 1, duration: 0.9, ease: 'back.out(1.4)' }, i * 0.42 + 0.1);
    });
    return tl;
  }

  explodeOrder(reverse) {
    const ids = this.list.filter((p) => p.spec.exploded !== p.spec.compact).map((p) => p.spec.id);
    return reverse ? ids.reverse() : ids;
  }

  explodeTimeline(reverse = false) {
    const tl = gsap.timeline();
    this.explodeOrder(reverse).forEach((id, i) => {
      const [a, b] = reverse ? [1, 0] : [0, 1];
      tl.fromTo(this.parts[id].state, { explode: a }, { explode: b, duration: 1.2, ease: 'power3.inOut', immediateRender: false }, i * 0.14);
    });
    return tl;
  }

  update() {
    this.list.forEach((p) => {
      p.apply();
      p.u.uHeat.value = this.state.heat;
      p.setGhost(p === this.parts.housing ? 0 : this.state.ghost);
      const mid = p.group.position.y + p.midY * p.group.scale.y;
      const cast = GLOBAL.uScanY.value < mid && p.u.uGhost.value < 0.5 && p.state.flat > 0.5;
      p.meshes.forEach((m) => (m.castShadow = cast));
    });
    this.scanner.position.y = GLOBAL.uScanY.value;
    this.scannerUniforms.uOpacity.value = this.state.scanner;
    this.scanner.visible = this.state.scanner > 0.01;
    this.axes.forEach((a, i) => (a.material.opacity = this.state.axes * (i ? 0.55 : 0.85)));
    this.isoLines.material.opacity = this.leftU.uClay.value;
  }
}
