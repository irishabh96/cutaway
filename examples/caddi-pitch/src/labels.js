import * as THREE from 'three';

const _v = new THREE.Vector3();

export class LabelLayer {
  constructor(root, camera) {
    this.root = root;
    this.camera = camera;
    this.items = [];
  }

  add({ anchor, object = null, text, visible = () => true, cls = '' }) {
    const el = document.createElement('div');
    el.className = `label ${cls}`;
    el.innerHTML = '<i class="pin"></i><i class="lead"></i><span class="txt"></span>';
    this.root.appendChild(el);
    const item = { el, txt: el.querySelector('.txt'), anchor, object, text, visible, last: '', shown: false };
    this.items.push(item);
    return item;
  }

  update(width, height) {
    for (const it of this.items) {
      let show = it.visible();
      if (show) {
        _v.copy(it.anchor());
        if (it.object) it.object.localToWorld(_v);
        _v.project(this.camera);
        show = Math.abs(_v.x) < 1.05 && Math.abs(_v.y) < 1.05;
        if (show) {
          const x = (_v.x * 0.5 + 0.5) * width;
          const y = (-_v.y * 0.5 + 0.5) * height;
          it.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
          const html = it.text();
          if (html !== it.last) {
            it.txt.innerHTML = html;
            it.last = html;
          }
        }
      }
      if (show !== it.shown) {
        it.el.style.opacity = show ? '1' : '0';
        it.shown = show;
      }
    }
  }
}
