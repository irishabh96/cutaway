import gsap from 'gsap';
import { STAGES } from './config.js';
import { createStage } from './stage.js';
import { GLOBAL, assertChunks } from './shaders.js';
import { LabelLayer } from './labels.js';
import { Hud } from './hud.js';
import { Assembly } from './assembly.js';
import { SplitComparison } from './split.js';
import { DataMap } from './datamap.js';
import { Inspector } from './inspect.js';
import { SoundEngine } from './soundEngine.js';
import { buildMaster, ROI_START } from './timeline.js';

const startBtn = document.getElementById('start-btn');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

await Promise.race([
  document.fonts.load('600 20px "JetBrains Mono"').catch(() => {}),
  new Promise((r) => setTimeout(r, 1500)),
]);

let stage;
try {
  stage = createStage(document.getElementById('gl'));
} catch (err) {
  const msg = document.getElementById('start-error');
  msg.hidden = false;
  msg.textContent = 'WebGL 2 is unavailable in this browser (hardware acceleration may be off). The 3D showcase cannot start.';
  startBtn.disabled = true;
  throw err;
}
assertChunks();

const { scene, camera, rig, renderer, size } = stage;
stage.resize();

const state = { live: false, roi: 0 };
const sound = new SoundEngine();
const labels = new LabelLayer(document.getElementById('labels'), camera);
const hud = new Hud();
const asm = new Assembly({ labels });
scene.add(asm.group);
const split = new SplitComparison({ assembly: asm, labels, scene, onTick: () => state.live && sound.tick() });
const map = new DataMap({ assembly: asm, container: document.getElementById('cards'), camera });
scene.add(map.group);
const inspector = new Inspector({
  camera,
  canvas: stage.renderer.domElement,
  assembly: asm,
  onChange: (hit, screen) => {
    hud.inspect(hit, screen);
    if (hit) sound.hover();
  },
  onMove: (screen) => hud.move(screen),
});

const master = buildMaster({ rig, sheet: stage.sheetUniforms, asm, split, map, sound, state });

master.time(STAGES[0].hold, true);
rig.snap();

let looping = true;
let jump = null;

function currentStage() {
  return STAGES.reduce((c, s, i) => (master.time() >= s.start ? i : c), 0);
}

function setLooping(on) {
  looping = on;
  hud.setLooping(on);
  if (on) {
    jump?.kill();
    state.live = true;
    master.play();
  } else {
    goToStage(currentStage(), false);
  }
}

function goToStage(i, click = true) {
  looping = false;
  hud.setLooping(false);
  master.pause();
  jump?.kill();
  if (click) sound.uiClick(true);
  state.live = false;
  const target = STAGES[i].hold;
  const duration = reducedMotion ? 0 : Math.min(1.6, 0.6 + Math.abs(master.time() - target) * 0.06);
  jump = gsap.to(master, { time: target, duration, ease: 'power2.inOut', onComplete: () => (state.live = true) });
}

function toggleSound() {
  sound.setEnabled(!sound.enabled);
  hud.setSound(sound.enabled);
  sound.uiClick();
}

hud.on('stage', (i) => goToStage(i));
hud.on('mode', () => {
  sound.uiClick();
  setLooping(!looping);
});
hud.on('sound', toggleSound);

document.addEventListener('click', (e) => {
  if (e.detail > 0 && e.target.closest('button')) e.target.closest('button').blur();
});

window.addEventListener('keydown', (e) => {
  if (!document.body.classList.contains('started') || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if ((e.code === 'Space' || e.code === 'Enter') && e.target.closest?.('button')) return;
  const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
  if (n >= 0 && n < STAGES.length) goToStage(n);
  else if (e.code === 'Space') {
    e.preventDefault();
    sound.uiClick();
    setLooping(!looping);
  } else if (e.code === 'KeyM') toggleSound();
  else if (e.code === 'KeyH') hud.toggle();
  else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
    const step = e.code === 'ArrowRight' ? 1 : STAGES.length - 1;
    goToStage((currentStage() + step) % STAGES.length);
  }
});
window.addEventListener('resize', () => stage.resize());

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  try {
    await sound.init();
  } catch (err) {
    console.warn('[sound] Web Audio unavailable; continuing silently', err);
  }
  sound.powerUp();
  document.body.classList.add('started');
  document.getElementById('start').setAttribute('aria-hidden', 'true');
  gsap.to('#start', { autoAlpha: 0, duration: reducedMotion ? 0 : 0.7, ease: 'power2.inOut', delay: reducedMotion ? 0 : 0.5 });
  master.time(0, true);
  if (reducedMotion) {
    goToStage(0, false);
  } else {
    state.live = true;
    setLooping(true);
  }
}, { once: true });

let elapsed = 0;
renderer.info.autoReset = false;
gsap.ticker.add((_t, deltaMs) => {
  const dt = Math.min(deltaMs / 1000, 0.1);
  elapsed += dt;
  renderer.info.reset();
  stage.update(dt, elapsed);
  asm.update();
  split.update();
  map.update(elapsed, size);
  inspector.update();
  stage.render();
  labels.update(size.width, size.height);
  const t = master.time();
  const roi = t >= ROI_START && t < STAGES[3].end ? state.roi : 1;
  hud.update({ time: t, dt, renderer, scanY: GLOBAL.uScanY.value, roi, bins: sound.spectrum(), soundOn: sound.enabled });
});
