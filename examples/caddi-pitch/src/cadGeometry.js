import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const RADIAL = 72;

export const FEATURES = {
  manifold: [
    { key: 'bore', heat: 1.0, name: 'Ø48 THRU PASSAGE', tol: '±0.02 · reamed', cost: '+$2.10' },
    { key: 'tap', heat: 0.85, name: 'M6×1.0 TAPPED HOLE', tol: '6H · ▽12', cost: '+$0.40 ea' },
    { key: 'port', heat: 0.62, name: 'G1/4 PORT · DEEP POCKET L/D 4.6', tol: 'Ø13 · Ra 1.6', cost: '+$1.80' },
    { key: 'mount', heat: 0.45, name: 'MOUNTING HOLE Ø11', tol: '±0.1', cost: '+$0.20' },
    { key: 'milled', heat: 0.36, name: 'MILLED TOP FACE', tol: 'Ra 1.6 · ⏥ 0.02', cost: '+$3.40' },
    { key: 'stock', heat: 0.08, name: 'STOCK SURFACE', tol: 'ISO 2768-m', cost: 'base' },
  ],
  housing: [
    { key: 'bore', heat: 1.0, name: 'BORE Ø48.00 H7', tol: '±0.01 · ⌖ 0.02 A|B', cost: '+$6.80' },
    { key: 'seat', heat: 0.82, name: 'BEARING SEAT Ø62 H7', tol: '+0.030/0 · Ra 0.8', cost: '+$4.20' },
    { key: 'chamfer', heat: 0.55, name: 'CHAMFER 0.5×45°', tol: 'REV.D change', cost: '+$0.30' },
    { key: 'lip', heat: 0.22, name: 'FLANGE LIP Ø130', tol: '±0.1', cost: '+$0.90' },
    { key: 'od', heat: 0.06, name: 'TURNED OD Ø89.6', tol: 'ISO 2768-m', cost: 'base' },
  ],
  bolts: [
    { key: 'thread', heat: 0.5, name: 'THREAD M6×1.0', tol: '6g', cost: 'catalog' },
    { key: 'head', heat: 0.15, name: 'SOCKET HEAD', tol: 'ISO 4762', cost: 'catalog' },
  ],
  bearing: [
    { key: 'race', heat: 0.75, name: 'RACEWAY', tol: 'P6 · ground', cost: 'catalog' },
    { key: 'ring', heat: 0.3, name: 'RING FACE', tol: 'Ø62 × Ø30 × 16', cost: 'catalog' },
  ],
  flange: [
    { key: 'slot', heat: 0.9, name: 'RADIAL SLOT 8.0 W', tol: '±0.05 · wire EDM', cost: '+$2.60' },
    { key: 'bore', heat: 0.7, name: 'CENTRE BORE Ø31', tol: 'H8', cost: '+$0.70' },
    { key: 'hub', heat: 0.3, name: 'HUB Ø46.4', tol: 'ISO 2768-m', cost: '+$0.40' },
    { key: 'face', heat: 0.18, name: 'FACE', tol: 'Ra 3.2', cost: 'base' },
  ],
  shaft: [
    { key: 'keyway', heat: 0.95, name: 'KEYWAY 8 N9', tol: 'milled', cost: '+$1.10' },
    { key: 'journal', heat: 0.55, name: 'JOURNAL Ø30 h6', tol: 'Ra 0.4 ground', cost: '+$2.40' },
    { key: 'step', heat: 0.3, name: 'STEP Ø24', tol: 'ISO 2768-m', cost: 'base' },
  ],
};

export const heatOf = (part, key) => FEATURES[part].find((f) => f.key === key).heat;

export function featureAt(part, heat) {
  return FEATURES[part].reduce((best, f) => (Math.abs(f.heat - heat) < Math.abs(best.heat - heat) ? f : best));
}

export function latheSolid(profile, phiStart = 0, phiLength = Math.PI * 2, segments = RADIAL) {
  const parts = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const a = profile[i];
    const b = profile[i + 1];
    if (a.distanceTo(b) < 1e-6) continue;
    parts.push(new THREE.LatheGeometry([a, b], segments, phiStart, phiLength));
  }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

const p2 = (r, y) => new THREE.Vector2(r, y);

function setHeat(geo, fn) {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const heat = new Float32Array(pos.count);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nrm, i);
    heat[i] = fn(p, n);
  }
  geo.setAttribute('heat', new THREE.BufferAttribute(heat, 1));
  return geo;
}

const radial = (p) => Math.hypot(p.x, p.z);

function extrudeUp(shape, depth, bevel = 0.025) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 48,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bevel, 0);
  return geo;
}

function circlePath(x, y, r, path = new THREE.Path()) {
  path.absarc(x, y, r, 0, Math.PI * 2, true);
  return path;
}

export const MANIFOLD = { w: 4.2, d: 3.2, h: 1.4, bore: 0.6, tap: 0.0625, pcd: 1.0, mount: 0.14 };

export function manifoldGeometry() {
  const { w, d, h, bore, tap, pcd, mount } = MANIFOLD;
  const r = 0.22;
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -d / 2);
  s.lineTo(w / 2 - r, -d / 2);
  s.absarc(w / 2 - r, -d / 2 + r, r, -Math.PI / 2, 0);
  s.lineTo(w / 2, d / 2 - r);
  s.absarc(w / 2 - r, d / 2 - r, r, 0, Math.PI / 2);
  s.lineTo(-w / 2 + r, d / 2);
  s.absarc(-w / 2 + r, d / 2 - r, r, Math.PI / 2, Math.PI);
  s.lineTo(-w / 2, -d / 2 + r);
  s.absarc(-w / 2 + r, -d / 2 + r, r, Math.PI, Math.PI * 1.5);
  s.holes.push(circlePath(0, 0, bore));
  const taps = [[pcd, pcd], [-pcd, pcd], [-pcd, -pcd], [pcd, -pcd]];
  taps.forEach(([x, y]) => s.holes.push(circlePath(x, y, tap)));
  const mounts = [[1.75, 1.25], [-1.75, 1.25], [-1.75, -1.25], [1.75, -1.25]];
  mounts.forEach(([x, y]) => s.holes.push(circlePath(x, y, mount)));
  const geo = extrudeUp(s, h - 0.05);
  const centres = [[0, 0, bore], ...taps.map(([x, y]) => [x, -y, tap]), ...mounts.map(([x, y]) => [x, -y, mount])];
  setHeat(geo, (p, n) => {
    if (Math.abs(n.y) < 0.5) {
      for (const [cx, cz, cr] of centres) {
        if (Math.hypot(p.x - cx, p.z - cz) < cr + 0.04) return heatOf('manifold', cr === tap ? 'tap' : cr === bore ? 'bore' : 'mount');
      }
      return heatOf('manifold', 'stock');
    }
    return heatOf('manifold', p.y > h * 0.5 ? 'milled' : 'stock');
  });
  return geo;
}

export function portGeometry() {
  const profile = [p2(0.32, 0), p2(0.32, 0.03), p2(0.19, 0.03), p2(0.19, -0.18), p2(0.0, -0.18)];
  const geo = latheSolid(profile, 0, Math.PI * 2, 40);
  setHeat(geo, () => heatOf('manifold', 'port'));
  return geo;
}

export const HOUSING_PROFILE = [
  p2(0.6, 0), p2(1.62, 0), p2(1.62, 0.25), p2(1.12, 0.25), p2(1.12, 1.6), p2(1.0, 1.8),
  p2(0.775, 1.8), p2(0.775, 1.4), p2(0.6, 1.4), p2(0.6, 0),
];

function housingHeat(p) {
  const r = radial(p);
  if (r < 0.62) return heatOf('housing', 'bore');
  if (r < 0.8 && p.y > 1.38) return heatOf('housing', 'seat');
  if (p.y > 1.58 && r > 0.98) return heatOf('housing', 'chamfer');
  if (p.y < 0.27 && r > 1.15) return heatOf('housing', 'lip');
  return heatOf('housing', 'od');
}

export function housingGeometry(phiStart = 0, phiLength = Math.PI * 2) {
  return setHeat(latheSolid(HOUSING_PROFILE, phiStart, phiLength), housingHeat);
}

export function housingSectionGeometry() {
  const shape = new THREE.Shape(HOUSING_PROFILE.slice(0, -1));
  const right = new THREE.ShapeGeometry(shape);
  right.rotateY(-Math.PI / 2);
  const left = right.clone();
  left.scale(1, 1, -1);
  const geo = mergeGeometries([right.toNonIndexed(), left.toNonIndexed()]);
  geo.computeVertexNormals();
  return setHeat(geo, () => 0);
}

export function boltGeometry() {
  const head = new THREE.Shape();
  head.absarc(0, 0, 0.125, 0, Math.PI * 2, false);
  const hex = new THREE.Path();
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    i === 0 ? hex.moveTo(Math.cos(a) * 0.065, Math.sin(a) * 0.065) : hex.lineTo(Math.cos(a) * 0.065, Math.sin(a) * 0.065);
  }
  head.holes.push(hex);
  const headGeo = extrudeUp(head, 0.13, 0.012);
  const floor = new THREE.CylinderGeometry(0.066, 0.066, 0.01, 6).toNonIndexed();
  floor.translate(0, 0.07, 0);
  const pts = [p2(0.0, -0.6), p2(0.06, -0.6)];
  for (let y = -0.58; y < -0.02; y += 0.025) pts.push(p2(0.075, y), p2(0.064, y + 0.0125));
  pts.push(p2(0.075, -0.01), p2(0.075, 0), p2(0, 0));
  const shank = latheSolid(pts, 0, Math.PI * 2, 24);
  const geo = mergeGeometries([headGeo, floor, shank]);
  return setHeat(geo, (p) => heatOf('bolts', p.y < 0 ? 'thread' : 'head'));
}

export function bearingGeometry() {
  const outer = latheSolid([p2(0.65, 0), p2(0.775, 0), p2(0.775, 0.4), p2(0.65, 0.4), p2(0.65, 0.27), p2(0.62, 0.2), p2(0.65, 0.13), p2(0.65, 0)]);
  const inner = latheSolid([p2(0.375, 0), p2(0.5, 0), p2(0.5, 0.13), p2(0.53, 0.2), p2(0.5, 0.27), p2(0.5, 0.4), p2(0.375, 0.4), p2(0.375, 0)]);
  const balls = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const b = new THREE.SphereGeometry(0.075, 16, 10).toNonIndexed();
    b.translate(Math.cos(a) * 0.575, 0.2, Math.sin(a) * 0.575);
    balls.push(b);
  }
  const seal = latheSolid([p2(0.65, 0.385), p2(0.5, 0.385)], 0, Math.PI * 2, 48);
  const seal2 = latheSolid([p2(0.5, 0.015), p2(0.65, 0.015)], 0, Math.PI * 2, 48);
  const geo = mergeGeometries([outer, inner, seal, seal2, ...balls]);
  return setHeat(geo, (p) => {
    const r = radial(p);
    return heatOf('bearing', r > 0.52 && r < 0.64 ? 'race' : 'ring');
  });
}

export function flangeGeometry() {
  const s = new THREE.Shape();
  s.absarc(0, 0, 1.3, 0, Math.PI * 2, false);
  s.holes.push(circlePath(0, 0, 0.39));
  const slots = 6;
  const hw = 0.08;
  for (let i = 0; i < slots; i++) {
    const a = (i / slots) * Math.PI * 2 + Math.PI / 6;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const r0 = 0.66;
    const r1 = 1.05;
    const slot = new THREE.Path();
    slot.absarc(c * r1, sn * r1, hw, a - Math.PI / 2, a + Math.PI / 2, false);
    slot.absarc(c * r0, sn * r0, hw, a + Math.PI / 2, a + Math.PI * 1.5, false);
    slot.closePath();
    s.holes.push(slot);
  }
  const plate = extrudeUp(s, 0.24, 0.02);
  const hub = latheSolid([p2(0.39, 0.28), p2(0.58, 0.28), p2(0.58, 0.4), p2(0.53, 0.45), p2(0.39, 0.45), p2(0.39, 0.28)]);
  const geo = mergeGeometries([plate, hub]);
  return setHeat(geo, (p, n) => {
    const r = radial(p);
    if (r < 0.41) return heatOf('flange', 'bore');
    if (p.y > 0.279 && r < 0.59) return heatOf('flange', 'hub');
    if (Math.abs(n.y) < 0.5 && r > 0.55 && r < 1.15) return heatOf('flange', 'slot');
    return heatOf('flange', 'face');
  });
}

export function shaftGeometry() {
  const profile = [
    p2(0, 0), p2(0.28, 0), p2(0.3, 0.02), p2(0.3, 0.6), p2(0.375, 0.62), p2(0.375, 2.2),
    p2(0.35, 2.22), p2(0.35, 2.26), p2(0.375, 2.28), p2(0.375, 2.98), p2(0.35, 3.0), p2(0, 3.0),
  ];
  const body = latheSolid(profile);
  const key = new THREE.BoxGeometry(0.16, 0.6, 0.1).toNonIndexed();
  key.translate(0, 2.6, 0.34);
  const geo = mergeGeometries([body, key]);
  return setHeat(geo, (p) => heatOf('shaft', p.y > 2.25 && Math.abs(p.x) < 0.1 && p.z > 0.25 ? 'keyway' : p.y > 0.6 ? 'journal' : 'step'));
}

export function sampleSurface(geo, count) {
  const pos = geo.attributes.position;
  const tris = pos.count / 3;
  const areas = new Float32Array(tris);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let total = 0;
  for (let i = 0; i < tris; i++) {
    a.fromBufferAttribute(pos, i * 3);
    b.fromBufferAttribute(pos, i * 3 + 1);
    c.fromBufferAttribute(pos, i * 3 + 2);
    total += b.sub(a).cross(c.sub(a)).length() * 0.5;
    areas[i] = total;
  }
  const out = new Float32Array(count * 3);
  for (let k = 0; k < count; k++) {
    const t = Math.random() * total;
    let lo = 0;
    let hi = tris - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (areas[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    a.fromBufferAttribute(pos, lo * 3);
    b.fromBufferAttribute(pos, lo * 3 + 1);
    c.fromBufferAttribute(pos, lo * 3 + 2);
    let u = Math.random();
    let w = Math.random();
    if (u + w > 1) {
      u = 1 - u;
      w = 1 - w;
    }
    out[k * 3] = a.x + (b.x - a.x) * u + (c.x - a.x) * w;
    out[k * 3 + 1] = a.y + (b.y - a.y) * u + (c.y - a.y) * w;
    out[k * 3 + 2] = a.z + (b.z - a.z) * u + (c.z - a.z) * w;
  }
  return out;
}
