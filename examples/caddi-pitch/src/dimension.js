import * as THREE from 'three';
import { PALETTE } from './config.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _side = new THREE.Vector3();

export class DimensionLine {
  constructor({ offset = new THREE.Vector3(0, 1, 0), extent = 1, color = PALETTE.ink, arrow = 0.16, dashed = false } = {}) {
    this.offset = offset.clone().normalize();
    this.extent = extent;
    this.arrow = arrow;
    this.p1 = new THREE.Vector3();
    this.p2 = new THREE.Vector3();
    this.opacity = 0;

    const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0 });
    this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat);
    this.lines.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const runMat = dashed
      ? new THREE.LineDashedMaterial({ color, dashSize: 0.12, gapSize: 0.07, transparent: true, opacity: 0 })
      : lineMat;
    this.run = new THREE.Line(new THREE.BufferGeometry(), runMat);
    this.run.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.dashed = dashed;
    this.heads = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide }));
    this.heads.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.group = new THREE.Group();
    this.group.add(this.lines, this.run, this.heads);
    this.lines.frustumCulled = this.run.frustumCulled = this.heads.frustumCulled = false;
  }

  midpoint(target) {
    return target.copy(this.p1).add(this.p2).multiplyScalar(0.5).addScaledVector(this.offset, this.extent);
  }

  update() {
    const off = this.offset;
    _a.copy(this.p1).addScaledVector(off, this.extent);
    _b.copy(this.p2).addScaledVector(off, this.extent);
    _dir.subVectors(_b, _a);
    const len = _dir.length();
    _dir.normalize();
    _side.copy(off).multiplyScalar(this.arrow * 0.32);
    const head = Math.min(this.arrow, len * 0.3);

    const l = this.lines.geometry.attributes.position;
    const gap = 0.06;
    const over = 0.12;
    l.setXYZ(0, this.p1.x + off.x * gap, this.p1.y + off.y * gap, this.p1.z + off.z * gap);
    l.setXYZ(1, _a.x + off.x * over, _a.y + off.y * over, _a.z + off.z * over);
    l.setXYZ(2, this.p2.x + off.x * gap, this.p2.y + off.y * gap, this.p2.z + off.z * gap);
    l.setXYZ(3, _b.x + off.x * over, _b.y + off.y * over, _b.z + off.z * over);
    l.needsUpdate = true;
    const r = this.run.geometry.attributes.position;
    r.setXYZ(0, _a.x, _a.y, _a.z);
    r.setXYZ(1, _b.x, _b.y, _b.z);
    r.needsUpdate = true;
    if (this.dashed) this.run.computeLineDistances();

    const h = this.heads.geometry.attributes.position;
    const tri = (i, tip, sign) => {
      const bx = tip.x + _dir.x * head * sign;
      const by = tip.y + _dir.y * head * sign;
      const bz = tip.z + _dir.z * head * sign;
      h.setXYZ(i, tip.x, tip.y, tip.z);
      h.setXYZ(i + 1, bx + _side.x, by + _side.y, bz + _side.z);
      h.setXYZ(i + 2, bx - _side.x, by - _side.y, bz - _side.z);
    };
    tri(0, _a, 1);
    tri(3, _b, -1);
    h.needsUpdate = true;

    this.lines.material.opacity = this.run.material.opacity = this.heads.material.opacity = this.opacity;
    this.group.visible = this.opacity > 0.001 && len > 0.02;
  }
}
