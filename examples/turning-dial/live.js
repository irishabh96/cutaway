// Page runtime for the turning dial. build.mjs inlines this after the kit's turn and gl
// scripts (TURN, glLayer, glslPose, GLSL_TURN and settle are globals here) and fills in
// the figure's data and its three motion functions.
const DATA = __DATA__;
const MOTION = __MOTION__;
__FUNCTIONS__

const stage = document.querySelector(".td-stage");
const plate = stage.closest(".iso-plate");
const readoutEl = (plate && plate.querySelector("[data-readout]")) || document.querySelector("[data-readout]");
const calmQuery = matchMedia("(prefers-reduced-motion: reduce)");
const themed = stage.closest("[data-theme]");
const LIGHT = themed && themed.getAttribute("data-theme") === "dark" ? 0 : 1;
const DIVISION = 3.6;
const INDEX_DEG = (DATA.index * 180) / Math.PI;
const TOUR_RATE = 18;
const RESUME_MS = 3600;
const FOLLOW_TAU = 0.12;
const LIFT_TAU = 0.15;
const POD_END = DATA.pod.end;

const view = { angle: 0, target: 0, lift: 0, liftGoal: 0 };
const pod = { t: 0, dir: 0, tool: undefined };
let touring = !calmQuery.matches;
let clock = 0;
let resumeTimer = 0;
let frame = 0;
let last = 0;
let visible = false;
let ready = false;
let mine = false;
let shownText = "";
let shownNow = "";
let shownValueText = "";
let shownFallback = "";

const calm = () => calmQuery.matches;
const readingOf = (theta) => {
  const raw = (INDEX_DEG + 90 - theta) / DIVISION;
  return ((Math.round(raw) % 100) + 100) % 100;
};
const broken = () => (pod.tool !== undefined ? pod.tool !== null : pod.t > 0);
const podValue = () => (pod.tool !== undefined ? pod.tool : breakAt(pod.t));

function stopTour() {
  touring = false;
  clearTimeout(resumeTimer);
  resumeTimer = 0;
}

function holdForReader() {
  stopTour();
  if (calm()) return;
  resumeTimer = setTimeout(() => {
    resumeTimer = 0;
    if (calm()) return;
    touring = true;
    view.target = view.angle;
    run();
  }, RESUME_MS);
}

// ---------------------------------------------------------------------------
// The controller. Renders the page asks for set `mine`; any other render came from a tool.
const controller = TURN.mount(stage, DATA.turn, {
  follow,
  onHold: stopTour,
  onFrame: (c) => {
    if (!ready) return;
    if (!mine) adopt(c.values);
    announce();
    paintGl(c);
  },
});

function adopt(values) {
  if (typeof values.dial === "number") {
    view.angle = values.dial;
    view.target = values.dial;
  }
  if (typeof values.lift === "number") {
    view.lift = values.lift;
    view.liftGoal = values.lift;
  }
  if (values.pod !== undefined && values.pod !== sentPod) pod.tool = values.pod;
}

let sentPod = null;
function render() {
  mine = true;
  sentPod = podValue();
  try {
    controller.set({ dial: view.angle, lift: view.lift, pod: sentPod });
  } finally {
    mine = false;
  }
}

function announce() {
  const theta = view.angle;
  const turned = (((theta % 360) + 360) % 360).toFixed(1);
  const text = `dial ${readingOf(theta)} · ${turned === "360.0" ? "0.0" : turned}°${broken() ? " · pod off" : ""}`;
  if (readoutEl && text !== shownText) {
    readoutEl.textContent = text;
    shownText = text;
  }
  const now = String(readingOf(view.target));
  if (now !== shownNow) {
    stage.setAttribute("aria-valuenow", now);
    shownNow = now;
  }
  const valueText = `dial at ${now}${broken() ? ", the pod has broken off" : ""}`;
  if (valueText !== shownValueText) {
    stage.setAttribute("aria-valuetext", valueText);
    shownValueText = valueText;
  }
}

// ---------------------------------------------------------------------------
// The loop: runs only while something moves and the stage is on screen.
function tick(now) {
  frame = 0;
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
  last = now;
  const still = calm();
  if (touring && !still) {
    clock += dt;
    view.target += TOUR_RATE * dt;
    view.liftGoal = tapAt(clock);
  }
  view.angle = still ? view.target : view.angle + (view.target - view.angle) * (1 - Math.exp(-dt / FOLLOW_TAU));
  if (Math.abs(view.target - view.angle) < 1e-3) view.angle = view.target;
  view.lift = still ? view.liftGoal : view.lift + (view.liftGoal - view.lift) * (1 - Math.exp(-dt / LIFT_TAU));
  if (Math.abs(view.liftGoal - view.lift) < 1e-4) view.lift = view.liftGoal;
  if (pod.dir) {
    pod.t = Math.max(0, Math.min(POD_END, pod.t + pod.dir * dt));
    if (pod.t === 0 || pod.t === POD_END) pod.dir = 0;
  }
  stepGl(dt, still);
  render();
  const moving = touring || view.angle !== view.target || view.lift !== view.liftGoal || pod.dir !== 0 || glBusy();
  if (moving && visible) frame = requestAnimationFrame(tick);
}

function run() {
  if (frame || !visible) return;
  last = 0;
  frame = requestAnimationFrame(tick);
}

new IntersectionObserver(
  (entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) run();
  },
  { rootMargin: "120px 0px" },
).observe(stage);

const onCalm = () => {
  if (calm()) {
    stopTour();
    view.angle = view.target;
    view.lift = view.liftGoal;
    sparks.length = 0;
    run();
  }
};
if (calmQuery.addEventListener) calmQuery.addEventListener("change", onCalm);
else if (calmQuery.addListener) calmQuery.addListener(onCalm);

// ---------------------------------------------------------------------------
// Reader input.
let press = null;
stage.addEventListener("pointerdown", (event) => {
  if (event.button !== undefined && event.button !== 0) return;
  holdForReader();
  press = { id: event.pointerId, from: controller.angleAt(event.clientX, event.clientY, DATA.gl.face.z, "dial"), base: view.target, dragging: false };
});
stage.addEventListener("pointermove", (event) => {
  if (!press || event.pointerId !== press.id) return;
  const delta = controller.angleAt(event.clientX, event.clientY, DATA.gl.face.z, "dial") - press.from;
  if (!press.dragging) {
    if (Math.abs(delta) <= 1.5) return;
    press.dragging = true;
    try {
      stage.setPointerCapture(event.pointerId);
    } catch {}
    stage.setAttribute("data-drag", "");
  }
  holdForReader();
  view.target = press.base + delta;
  run();
});
const release = (event) => {
  if (!press || event.pointerId !== press.id) return;
  if (press.dragging) {
    try {
      stage.releasePointerCapture(event.pointerId);
    } catch {}
  }
  stage.removeAttribute("data-drag");
  press = null;
  holdForReader();
};
stage.addEventListener("pointerup", release);
stage.addEventListener("pointercancel", release);

const ZERO = INDEX_DEG + 90;
const snap = (theta) => ZERO - DIVISION * Math.round((ZERO - theta) / DIVISION);
stage.addEventListener("keydown", (event) => {
  const key = event.key;
  let handled = true;
  const from = touring ? view.angle : view.target;
  if (key === "ArrowRight" || key === "ArrowUp" || key === "ArrowLeft" || key === "ArrowDown") {
    const up = key === "ArrowRight" || key === "ArrowUp";
    const count = event.shiftKey ? 10 : 1;
    holdForReader();
    view.target = snap(from) + (up ? -1 : 1) * DIVISION * count;
  } else if (key === "Home") {
    holdForReader();
    view.target = ZERO + 360 * Math.round((from - ZERO) / 360);
  } else if (key === "b" || key === "B") {
    holdForReader();
    toggleBreak();
  } else handled = false;
  if (!handled) return;
  event.preventDefault();
  run();
});

function toggleBreak() {
  pod.tool = undefined;
  if (pod.dir) pod.dir = -pod.dir;
  else pod.dir = pod.t > 0 ? -1 : 1;
  if (pod.dir > 0 && pod.t === 0 && gl && !calm()) ignite();
  if (calm()) {
    pod.t = pod.dir > 0 ? POD_END : 0;
    pod.dir = 0;
  }
}

// ---------------------------------------------------------------------------
// WebGL: a light pool on the face (back canvas, under the hand), the LED lens and sparks (front canvas).
const POSE = typeof glslPose === "function" ? glslPose("Dial") : "";
const FACE = DATA.gl.face;
const num = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
const POOL = `
uniform float uLight;
uniform float uOn;
uniform vec3 uLed;
uniform vec3 uLedDir;
${POSE}
const float FACE_Z=${num(FACE.z)};
const float RIM=${num(FACE.r)};
const float HUB=${num(FACE.hub)};
void main(){
  if(uOn<.002){gl_FragColor=vec4(0.);return;}
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec3 p=onFloor(vb,FACE_Z);
  vec3 q=toDial(p);
  float r=length(q.xy);
  float annulus=smoothstep(HUB,HUB+1.6,r)*(1.-smoothstep(RIM-2.,RIM-.3,r));
  vec3 d=p-uLed;
  float h=max(uLed.z-FACE_Z,.4);
  float dist2=dot(d.xy,d.xy);
  float spread=h*1.6+3.;
  float fall=exp(-dist2/(2.*spread*spread))*(h*h/(h*h+dist2*.08));
  float aim=.3+.7*smoothstep(-.3,.85,dot(normalize(d),uLedDir));
  float grain=.86+.28*hash12(floor(q.xy*2.6));
  float e=fall*aim*annulus*grain*uOn*min(1.,9./(h*h+1.));
  if(e<.001){gl_FragColor=vec4(0.);return;}
  vec3 glow=vec3(.22,1.,.48)*(1.-exp(-1.8*e));
  vec4 dark=vec4(glow*.85,0.);
  float a=.62*(1.-exp(-1.5*e));
  vec4 ink=vec4(vec3(.06,.52,.24)*a,a);
  vec4 c=mix(dark,ink,uLight);
  c.rgb=min(c.rgb,max(c.a,step(.5,1.-uLight)*1.));
  float n=(hash12(gl_FragCoord.xy)-.5)/255.;
  gl_FragColor=c+vec4(n,n,n,n*uLight)*smoothstep(0.,1.5/255.,max(c.a,c.g));
}`;
const LENS = `
uniform float uLight;
uniform float uOn;
uniform vec2 uLens;
uniform float uLensR;
uniform float uFacing;
uniform vec4 uSpark[24];
uniform vec4 uHeat[6];
${GLSL_TURN}
float segment(vec2 p,vec2 a,vec2 b){vec2 ab=b-a;float t=clamp(dot(p-a,ab)/max(dot(ab,ab),1e-6),0.,1.);return length(p-a-ab*t);}
vec4 over(vec4 top,vec4 under){return top+under*(1.-top.a);}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  float px=pixelOf()*uK;
  vec4 c=vec4(0.);
  if(uOn>.002&&uFacing>.002){
    float d=length(vb-uLens);
    float body=1.-smoothstep(uLensR*.8,uLensR*1.05+.6*px,d);
    float core=1.-smoothstep(0.,uLensR*.55,d);
    float halo=exp(-d*d/(uLensR*uLensR*5.));
    float e=uOn*uFacing;
    vec3 seen=mix(vec3(.25,.95,.5),vec3(.9,1.,.92),core);
    vec4 dark=vec4(seen*(body+.45*halo)*e,body*e*.0);
    float a=(.9*body+.25*halo)*e;
    vec3 paper=mix(vec3(.1,.62,.3),vec3(.86,1.,.9),core*.8);
    vec4 ink=vec4(paper*a,a);
    c=mix(dark,ink,uLight);
  }
  for(int j=0;j<6;j++)for(int q=0;q<4;q++){
    vec4 h=uHeat[j];
    float heat=q==0?h.x:q==1?h.y:q==2?h.z:h.w;
    if(heat<=0.)continue;
    vec4 s=uSpark[j*4+q];
    float d=segment(vb,s.xy,s.zw);
    float w=.9*px+.25;
    float line=1.-smoothstep(w*.4,w,d);
    float k=line*heat;
    vec3 hot=mix(vec3(1.,.35,.08),vec3(1.,.9,.55),heat);
    vec4 dark=vec4(hot*k,0.);
    vec4 ink=vec4(mix(vec3(.75,.22,.04),vec3(.98,.62,.18),heat)*k*.9,k*.9);
    c=over(mix(dark,ink,uLight),c);
  }
  c*=1.-coverOf(vb,.7*px);
  c.rgb=min(c.rgb,mix(vec3(4.),vec3(c.a),uLight));
  float n=(hash12(gl_FragCoord.xy+.5)-.5)/255.;
  gl_FragColor=c+vec4(n,n,n,n*uLight)*smoothstep(0.,1.5/255.,max(c.a,max(c.r,c.g)));
}`;

const sparks = [];
let seed = 7;
const random = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const firstLight = { x: 0, v: 0 };
let gl = null;
let lightMoving = false;

function makeGl() {
  if (typeof glLayer !== "function") return null;
  const back = stage.querySelector('canvas[data-canvas="back"]');
  const front = stage.querySelector('canvas[data-canvas="front"]');
  if (!back || !front) return null;
  const common = { view: DATA.gl.view, camera: DATA.gl.camera, fixed: { uLight: LIGHT } };
  const pool = glLayer({ ...common, canvas: back, fragment: POOL, uniforms: ["uOn", "uLed", "uLedDir", "uDialX", "uDialY", "uDialZ", "uDialT"] });
  if (!pool) return null;
  const lens = glLayer({ ...common, canvas: front, fragment: LENS, uniforms: ["uOn", "uLens", "uLensR", "uFacing", "uSpark", "uHeat", "uCoverEdge", "uCoverCount"] });
  if (!lens) {
    pool.clear();
    return null;
  }
  const roomy = [pool, lens].every((layer) => layer.gl.getParameter(layer.gl.MAX_FRAGMENT_UNIFORM_VECTORS) >= 128);
  if (!roomy) return null;
  stage.setAttribute("data-gl", "");
  return { pool, lens };
}

function ignite() {
  const at = controller.anchor("dial", DATA.gl.socket).world;
  sparks.length = 0;
  for (let i = 0; i < 24; i++) {
    const a = random() * Math.PI * 2;
    const out = 6 + random() * 16;
    sparks.push({ p: at.slice(), v: [Math.cos(a) * out, Math.sin(a) * out, 10 + random() * 22], life: 0.45 + random() * 0.5, age: 0 });
  }
}

function stepGl(dt, still) {
  if (!gl) return;
  lightMoving = settle(firstLight, 1, dt, 0.35, still);
  for (const s of sparks) {
    s.age += dt;
    s.v[2] -= 60 * dt;
    for (let c = 0; c < 3; c++) s.p[c] += s.v[c] * dt;
  }
  for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].age >= sparks[i].life || sparks[i].p[2] < FACE.z) sparks.splice(i, 1);
  if (still) sparks.length = 0;
}

const glBusy = () => Boolean(gl) && (lightMoving || sparks.length > 0);

function paintGl(c) {
  const u = gl ? Math.max(0, Math.min(1, firstLight.x)) : 0;
  const fallback = (gl ? (1 - u) / (1 - u * 0.9) : 1).toFixed(3);
  if (fallback !== shownFallback) {
    stage.style.setProperty("--td-fallback", fallback);
    shownFallback = fallback;
  }
  if (!gl) return;
  const led = c.anchor(DATA.gl.led.group, DATA.gl.led.point, DATA.gl.led.dir);
  const cam = DATA.gl.camera.cam;
  const V = [cam[1] * cam[3], cam[0] * cam[3], cam[2]];
  const facing = Math.max(0, Math.min(1, (led.direction[0] * V[0] + led.direction[1] * V[1] + led.direction[2] * V[2] - 0.05) / 0.3));
  gl.pool.draw({ uOn: u, uLed: led.world, uLedDir: led.direction, ...TURN.poseUniforms(c, "dial", "uDial") }, 0);
  const world = c.cams().world;
  const screen = (p) => [world.ox + world.m[0] * p[0] + world.m[1] * p[1] + world.m[2] * p[2], world.oy + world.m[3] * p[0] + world.m[4] * p[1] + world.m[5] * p[2]];
  const streaks = new Float32Array(96);
  const heats = new Float32Array(24);
  sparks.forEach((s, i) => {
    const head = screen(s.p);
    const tail = screen([s.p[0] - s.v[0] * 0.03, s.p[1] - s.v[1] * 0.03, s.p[2] - s.v[2] * 0.03]);
    streaks.set([head[0], head[1], tail[0], tail[1]], 4 * i);
    heats[i] = Math.max(0, 1 - s.age / s.life);
  });
  const cover = TURN.cover(c, sparks.length ? [[DATA.gl.led.part], [DATA.gl.socketPart]] : [DATA.gl.led.part]);
  gl.lens.draw({ uOn: u, uLens: led.screen, uLensR: 0.75 * DATA.gl.camera.k, uFacing: facing, uSpark: streaks, uHeat: heats, uCoverEdge: cover.uCoverEdge, uCoverCount: cover.uCoverCount }, 0);
}

// ---------------------------------------------------------------------------
gl = makeGl();
ready = true;
if (calm()) firstLight.x = 1;
render();
announce();
run();
