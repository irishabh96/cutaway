import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PALETTE } from './config.js';
import { GLOBAL, gridShader, sheetShader, patchHatchShadow } from './shaders.js';
import { blueprintTexture, SHEET } from './textures.js';

const ISO_AZIMUTH = Math.PI / 4;
const ISO_ELEVATION = Math.atan(1 / Math.SQRT2);
const VIEW_HEIGHT = 18;
const dir = new THREE.Vector3();

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(PALETTE.paper, 1);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.paper);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.85;

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 600);

  const rig = {
    goal: { x: 0, y: 0.6, z: 0, zoom: 1.05 },
    target: new THREE.Vector3(0, 0.6, 0),
    zoom: 1.05,
    user: { az: 0, el: 0, zoom: 1 },
    userGoal: { az: 0, el: 0, zoom: 1 },
    pointer: new THREE.Vector2(),
    parallax: new THREE.Vector2(),
    snap() {
      this.target.set(this.goal.x, this.goal.y, this.goal.z);
      this.zoom = this.goal.zoom;
    },
    update(dt) {
      const k = 1 - Math.exp(-4 * dt);
      const ku = 1 - Math.exp(-8 * dt);
      this.target.x += (this.goal.x - this.target.x) * k;
      this.target.y += (this.goal.y - this.target.y) * k;
      this.target.z += (this.goal.z - this.target.z) * k;
      this.zoom += (this.goal.zoom - this.zoom) * k;
      for (const key of ['az', 'el', 'zoom']) this.user[key] += (this.userGoal[key] - this.user[key]) * ku;
      this.parallax.lerp(this.pointer, 1 - Math.exp(-2.5 * dt));
      const az = ISO_AZIMUTH + this.user.az + this.parallax.x * 0.045;
      const el = THREE.MathUtils.clamp(ISO_ELEVATION + this.user.el - this.parallax.y * 0.03, 0.12, 1.4);
      dir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
      camera.position.copy(this.target).addScaledVector(dir, 200);
      camera.lookAt(this.target);
      const z = this.zoom * this.user.zoom;
      if (Math.abs(camera.zoom - z) > 1e-5) {
        camera.zoom = z;
        camera.updateProjectionMatrix();
      }
    },
  };

  let drag = null;
  canvas.addEventListener('pointerdown', (e) => (drag = { x: e.clientX, y: e.clientY, az: rig.userGoal.az, el: rig.userGoal.el }));
  window.addEventListener('pointerup', () => (drag = null));
  window.addEventListener('pointermove', (e) => {
    rig.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    if (!drag) return;
    rig.userGoal.az = THREE.MathUtils.clamp(drag.az - (e.clientX - drag.x) * 0.005, -0.9, 0.9);
    rig.userGoal.el = THREE.MathUtils.clamp(drag.el + (e.clientY - drag.y) * 0.004, -0.45, 0.6);
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    rig.userGoal.zoom = THREE.MathUtils.clamp(rig.userGoal.zoom * Math.exp(-e.deltaY * 0.0012), 0.6, 2.4);
  }, { passive: false });
  canvas.addEventListener('dblclick', () => Object.assign(rig.userGoal, { az: 0, el: 0, zoom: 1 }));

  scene.add(new THREE.HemisphereLight('#ffffff', '#cfd6e2', 1.2));
  const key = new THREE.DirectionalLight('#ffffff', 2.4);
  key.position.set(-6, 14, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 60 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);

  const gridUniforms = { uInk: { value: new THREE.Color(PALETTE.ink) }, uCenter: { value: new THREE.Vector3() } };
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShaderMaterial({ ...gridShader, uniforms: gridUniforms, transparent: true, depthWrite: false }));
  grid.rotation.x = -Math.PI / 2;
  grid.position.y = -0.01;
  scene.add(grid);

  const sheetUniforms = {
    uMap: { value: blueprintTexture() },
    uReveal: { value: 0 },
    uPaper: { value: new THREE.Color(PALETTE.paper) },
    uScan: { value: new THREE.Color(PALETTE.cyan) },
  };
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(SHEET.w, SHEET.h), new THREE.ShaderMaterial({ ...sheetShader, uniforms: sheetUniforms }));
  sheet.rotation.x = -Math.PI / 2;
  sheet.renderOrder = -1;
  scene.add(sheet);
  const sheetEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(SHEET.w, SHEET.h)), new THREE.LineBasicMaterial({ color: PALETTE.ink, transparent: true, opacity: 0.6 }));
  sheetEdge.rotation.x = -Math.PI / 2;
  scene.add(sheetEdge);

  const shadowMat = new THREE.ShadowMaterial({ color: PALETTE.shadow, opacity: 0.55 });
  patchHatchShadow(shadowMat);
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), shadowMat);
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = 0.004;
  catcher.receiveShadow = true;
  scene.add(catcher);

  const size = { width: 1, height: 1, dpr: 1 };
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const aspect = w / h;
    const viewH = aspect < 1 ? Math.max(VIEW_HEIGHT, 22 / aspect) : VIEW_HEIGHT;
    Object.assign(camera, { left: (-viewH * aspect) / 2, right: (viewH * aspect) / 2, top: viewH / 2, bottom: -viewH / 2 });
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    GLOBAL.uPixelRatio.value = dpr;
    Object.assign(size, { width: w, height: h, dpr });
  }

  const lightDir = new THREE.Vector3();
  function update(dt, time) {
    rig.update(dt);
    GLOBAL.uTime.value = time;
    const t = rig.target;
    key.position.set(t.x - 6, 14, t.z + 9);
    key.target.position.set(t.x, 0, t.z);
    key.target.updateMatrixWorld();
    gridUniforms.uCenter.value.copy(t);
    camera.updateMatrixWorld();
    lightDir.subVectors(key.position, key.target.position).normalize().transformDirection(camera.matrixWorldInverse);
    GLOBAL.uLightView.value.copy(lightDir);
  }

  return { renderer, scene, camera, rig, size, resize, update, sheetUniforms, render: () => renderer.render(scene, camera) };
}
