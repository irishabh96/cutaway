import * as THREE from 'three';
import { GLOBAL } from './shaders.js';
import { featureAt } from './cadGeometry.js';

export class Inspector {
  constructor({ camera, canvas, assembly, onChange, onMove }) {
    this.camera = camera;
    this.asm = assembly;
    this.onChange = onChange;
    this.onMove = onMove;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.inside = false;
    this.frame = 0;
    this.key = null;
    this.screen = { x: 0, y: 0 };
    canvas.addEventListener('pointermove', (e) => {
      this.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      this.screen = { x: e.clientX, y: e.clientY };
      this.inside = e.pointerType === 'mouse' || e.pointerType === 'pen';
      if (this.key) this.onMove(this.screen);
    });
    canvas.addEventListener('pointerleave', () => {
      this.inside = false;
      this.set(null);
    });
  }

  candidates() {
    const out = [];
    for (const p of this.asm.list) {
      if (p.state.flat < 0.5 || p.u.uGhost.value > 0.5) continue;
      for (const m of p.meshes) {
        let o = m;
        let shown = true;
        while (o && shown) {
          shown = o.visible;
          o = o.parent;
        }
        if (shown) out.push(m);
      }
    }
    return out;
  }

  set(hit) {
    const key = hit ? `${hit.part.spec.id}:${hit.feature.key}` : null;
    if (key === this.key) return;
    this.key = key;
    this.asm.list.forEach((p) => (p.u.uHighlight.value = hit && p === hit.part ? 1 : 0));
    this.onChange(hit, this.screen);
  }

  update() {
    if (!this.inside || this.frame++ % 2) return;
    this.ray.setFromCamera(this.ndc, this.camera);
    const hits = this.ray.intersectObjects(this.candidates(), false).filter((h) => h.point.y >= GLOBAL.uScanY.value - 0.01);
    if (!hits.length) return this.set(null);
    const h = hits[0];
    const part = h.object.userData.part;
    const heat = h.object.geometry.attributes.heat;
    const hv = (heat.getX(h.face.a) + heat.getX(h.face.b) + heat.getX(h.face.c)) / 3;
    this.set({ part, feature: featureAt(part.spec.id, hv) });
  }
}
