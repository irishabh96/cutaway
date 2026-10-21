// Ripple tank runtime. Runs after the kit (iso, translateAlong, lineOnTop, sideRing),
// the GL kit (glLayer, settle, smooth) and the model (stateOf, readoutOf, spokenOf, patternOf).
(() => {
  const D = __RIPPLE_DATA__;
  const P = D.P;
  const TAU = Math.PI * 2;
  const root = document.querySelector(".rt");
  const stage = root.querySelector(".rt-stage");
  const readout = root.querySelector("[data-readout]");
  const hint = root.querySelector('[data-corner="hint"]');
  const said = stage.querySelector(".rt-said");
  const find = (name) => stage.querySelector(`[data-part="${name}"]`);
  const parts = {
    bar: find("bar"),
    motor: find("motor"),
    eccentric: find("eccentric"),
    far: find("dipper-far"),
    near: find("dipper-near"),
    pointer: find("pointer"),
    needle: find("needle"),
    nodal: find("nodal"),
    crests: find("crests"),
  };
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const pale = stage.closest('[data-theme="light"]') !== null;
  if (matchMedia("(hover: none)").matches && hint) hint.textContent = "Tap sets f and spacing · drag across for f";

  const [F0, F1] = D.range.f;
  const [D0, D1] = D.range.d;
  const clampF = (f) => Math.min(F1, Math.max(F0, f));
  const clampD = (d) => Math.min(D1, Math.max(D0, d));

  // ---- State: targets, and the displayed values that settle toward them ----
  const freq = { x: D.start.f, v: 0 };
  const gap = { x: D.start.d, v: 0 };
  const state = { tf: D.start.f, td: D.start.d };
  let model = stateOf(freq.x, gap.x, D.optics);
  let phase = D.startPhase; // the strobed (apparent) phase, 0.75 Hz
  let truePhase = 0; // the dippers' real accumulated phase
  let simTime = 0;
  let lampClock = 0;
  let lamp = 0;
  let lastK = model.k;
  let move = 0;

  // ---- Idle tour ----
  let touring = false;
  let tourClock = 0;
  let blendClock = 0;
  let tourFrom = null;
  let tourTimer = 0;
  const tourAt = (t) => [17 + 8.5 * Math.sin((TAU * t) / 28 - 0.118), 50 + 25 * Math.sin((TAU * t) / 16)];
  function beginTour() {
    if (still.matches) return;
    touring = true;
    blendClock = 0;
    tourFrom = [freq.x, gap.x];
    run();
  }
  tourTimer = setTimeout(beginTour, 1400);

  function takeOver() {
    if (touring) {
      touring = false;
      freq.v = 0;
      gap.v = 0;
    }
    clearTimeout(tourTimer);
    if (!still.matches) tourTimer = setTimeout(beginTour, 3600);
  }

  // ---- Announcements ----
  let sayTimer = 0;
  const say = (text) => {
    if (said.textContent !== text) said.textContent = text;
  };
  function announceLater() {
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => say(spokenOf(stateOf(state.tf, state.td, D.optics))), 700);
  }
  stage.addEventListener("focus", () => say(spokenOf(model)));

  function steer(f, d) {
    state.tf = clampF(f);
    state.td = clampD(d);
    announceLater();
    run();
  }

  // ---- Keys ----
  stage.addEventListener("keydown", (event) => {
    const big = event.shiftKey;
    const fromF = touring ? freq.x : state.tf;
    const fromD = touring ? gap.x : state.td;
    let f = fromF;
    let d = fromD;
    if (event.key === "ArrowRight") f += big ? 2 : 0.5;
    else if (event.key === "ArrowLeft") f -= big ? 2 : 0.5;
    else if (event.key === "ArrowUp") d += big ? 10 : 2;
    else if (event.key === "ArrowDown") d -= big ? 10 : 2;
    else if (event.key === "Home") f = F0;
    else if (event.key === "End") f = F1;
    else return;
    event.preventDefault();
    takeOver();
    steer(f, d);
  });

  // ---- Pointer ----
  const band = (value, lo, hi) => Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
  function pointAt(event) {
    const box = stage.getBoundingClientRect();
    const fx = (event.clientX - box.left) / box.width;
    const fy = (event.clientY - box.top) / box.height;
    return [F0 + (F1 - F0) * band(fx, 0.12, 0.88), D1 - (D1 - D0) * band(fy, 0.16, 0.82)];
  }
  stage.addEventListener("pointerdown", (event) => {
    const [f, d] = pointAt(event);
    takeOver();
    steer(f, d);
  });
  stage.addEventListener("pointermove", (event) => {
    const [f, d] = pointAt(event);
    if (event.pointerType === "touch") {
      if (!event.buttons && !event.pressure) return;
      const keepD = touring ? gap.x : state.td;
      takeOver();
      steer(f, keepD);
      return;
    }
    takeOver();
    steer(f, d);
  });

  // ---- History of the source, for changes that travel at the group speed ----
  const STEPS = 32;
  const RANGES = { k: 1, inv: 0.01, decay: 0.01, lag: 256 };
  const log = [];
  const bytes = new Uint8Array(STEPS * 2 * 4);
  const put = (offset, a, b) => {
    const qa = Math.round(Math.min(1, Math.max(0, a)) * 65535);
    const qb = Math.round(Math.min(1, Math.max(0, b)) * 65535);
    bytes[offset] = qa >> 8;
    bytes[offset + 1] = qa & 255;
    bytes[offset + 2] = qb >> 8;
    bytes[offset + 3] = qb & 255;
  };
  const sourceNow = () => ({ t: simTime, phi: truePhase, w: TAU * model.f, k: model.k, decay: model.decay, inv: 1 / (model.group * 1000) });
  function historyAt(t) {
    for (let index = log.length - 1; index > 0; index--) {
      const a = log[index - 1];
      const b = log[index];
      if (a.t <= t) {
        const s = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
        const mix = (key) => a[key] + (b[key] - a[key]) * s;
        return { phi: mix("phi"), w: mix("w"), k: mix("k"), decay: mix("decay"), inv: mix("inv") };
      }
    }
    const first = log[0];
    return { ...first, phi: first.phi - first.w * (first.t - t) };
  }
  function packHistory(calm) {
    const now = sourceNow();
    if (calm) log.length = 0;
    log.push(now);
    while (log.length > 2 && log[1].t < simTime - STEPS * D.step - 0.2) log.shift();
    for (let column = 0; column < STEPS; column++) {
      const age = column * D.step;
      const then = calm ? now : historyAt(simTime - age);
      // Phase the source gained since then beyond what its own frequency predicts.
      const lag = calm ? 0 : now.phi - then.phi - then.w * age;
      put(column * 4, then.k / RANGES.k, then.inv / RANGES.inv);
      put(STEPS * 4 + column * 4, then.decay / RANGES.decay, lag / RANGES.lag + 0.5);
    }
  }

  // ---- WebGL ----
  const FIELD = `
uniform sampler2D uHist;
uniform vec4 uSrc;
uniform float uPhase;
uniform float uStep;
uniform float uInvCg;
uniform float uKNow;
uniform float uMove;
uniform float uLampLevel;
uniform vec4 uZ;
uniform vec4 uInside;
uniform vec4 uRound;
uniform vec4 uLamp;
uniform vec4 uDip;
uniform vec4 uWave;
uniform vec4 uWave2;
uniform vec3 uInk;
uniform float uLight;
float sdRect(vec2 p,vec4 b,float r){vec2 q=abs(p-b.xy)-b.zw+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}
vec2 histTexel(float col,float row){vec4 t=texture2D(uHist,vec2((col+.5)/32.,(row+.5)*.5));return vec2(t.r*65280.+t.g*255.,t.b*65280.+t.a*255.)/65535.;}
vec2 histRow(float age,float row){float c=clamp(age/uStep,0.,31.);float c0=floor(c);return mix(histTexel(c0,row),histTexel(min(c0+1.,31.),row),c-c0);}
void addSource(vec2 p,vec2 s,float pxw,inout float h,inout vec2 g,inout vec3 hs){
  vec2 d=p-s;float r=sqrt(dot(d,d)+.04);vec2 n=d/r;
  float age=r*histRow(r*uInvCg,0.).y*uWave.w;
  vec2 a=histRow(age,0.);vec2 b=histRow(age,1.);
  float k=max(a.x*uWave.z,.05);
  float lam=6.2831853/k;
  float amp=uWave.x/k*sqrt((uWave.y+lam)/(uWave.y+r))*exp(-b.x*uWave2.x*r);
  amp*=smoothstep(2.5,5.,lam/pxw);
  float th=k*r-uPhase+(b.y-.5)*uWave2.y;
  float c=cos(th);float sn=sin(th);
  h+=amp*c;
  g-=amp*k*sn*n;
  float hrr=-amp*k*k*c;float htt=-amp*k*sn/max(r,1.5);
  hs+=vec3(hrr*n.x*n.x+htt*n.y*n.y,(hrr-htt)*n.x*n.y,hrr*n.y*n.y+htt*n.x*n.x);
}
float beachOf(vec2 p){return smoothstep(0.,uDip.z,-sdRect(p,uInside,uRound.x));}
void fieldAt(vec2 p,float pxw,out float h,out vec2 g,out vec3 hs){
  h=0.;g=vec2(0.);hs=vec3(0.);
  addSource(p,uSrc.xy,pxw,h,g,hs);
  addSource(p,uSrc.zw,pxw,h,g,hs);
  float f=beachOf(p);h*=f;g*=f;hs*=f;
}
float dither(){return (hash12(gl_FragCoord.xy+fract(uPhase*.37)*91.)+hash12(gl_FragCoord.yx*1.37+fract(uPhase*.61)*57.)-1.)/255.;}
`;

  const PAPER = `${FIELD}
uniform vec4 uOutside;
uniform vec4 uPaper;
uniform vec4 uBase;
uniform vec4 uLeg;
uniform vec4 uPost;
uniform vec4 uBar;
uniform vec4 uBeam;
uniform vec4 uMotor;
uniform vec4 uBox;
uniform vec4 uHeights;
uniform vec4 uCone;
uniform vec4 uExpo;
uniform vec4 uEps;
uniform float uOff;
vec2 legAt(int i){return vec2(i==1||i==3?uLeg.x:-uLeg.x,i>=2?uLeg.y:-uLeg.y);}
float penumbra(float t,float spread){return uLamp.w*t/max(1.-t,.02)*spread+.25;}
float rodLight(vec3 p,vec2 c,float rad,float z1,float spread){
  vec2 dxy=uLamp.xy-p.xy;
  float t=clamp(dot(c-p.xy,dxy)/max(dot(dxy,dxy),1e-4),0.,1.);
  float z=mix(p.z,uLamp.z,t);
  float pen=penumbra(t,spread);
  float d=length(p.xy+dxy*t-c)-rad;
  float span=1.-smoothstep(z1-pen*2.,z1+pen*2.,z);
  return 1.-span*(1.-smoothstep(-pen,pen,d));
}
float slabLight(vec3 p,vec4 b,float zs,float rad,float spread){
  float t=clamp((zs-p.z)/(uLamp.z-p.z),0.,.99);
  float pen=penumbra(t,spread);
  return smoothstep(-pen,pen,sdRect(mix(p.xy,uLamp.xy,t),b,rad));
}
float legClear(vec2 a,vec2 b){
  float s=clamp((uLeg.w-uZ.x)/(uZ.z-uZ.x),0.,1.);
  vec2 e=mix(a,b,s)-a;
  float c=1.;
  for(int i=0;i<4;i++){
    vec2 l=legAt(i)-a;
    float t=clamp(dot(l,e)/max(dot(e,e),1e-4),0.,1.);
    c*=smoothstep(1.,6.,length(e*t-l)-uLeg.z);
  }
  return c;
}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  float px=pixelOf();
  float pxf=px/uCam.z;
  vec3 q=onFloor(vb,uZ.x);
  float onBase=1.-smoothstep(-.7*pxf,.7*pxf,sdRect(q.xy,uBase,uRound.w));
  if(onBase<=0.){gl_FragColor=vec4(0.);return;}
  float Mg=uWave2.w;
  float Dc=uWave2.z;
  float pxw=pxf/Mg;
  vec3 ws=onFloor(vb,uZ.z);
  float seen=1.-smoothstep(-.7*pxf,.7*pxf,sdRect(ws.xy,uInside,uRound.x));
  vec2 shift=vec2(0.);
  if(seen>0.){
    float h0;vec2 g0;vec3 s0;
    fieldAt(ws.xy,pxf,h0,g0,s0);
    shift=g0*Dc*Mg*uEps.z*seen*legClear(q.xy,ws.xy);
  }
  vec3 p=vec3(q.xy+shift,uZ.x);
  float spread=1.;
#ifdef GL_OES_standard_derivatives
  spread=max(1.,length(fwidth(p.xy))/max(length(fwidth(q.xy)),1e-6));
#endif
  vec3 toLamp=uLamp.xyz-p;
  float cosT=toLamp.z/length(toLamp);
  float E=smoothstep(uCone.y,uCone.x,cosT)*cosT*cosT*cosT;
  float tb=clamp((uZ.y-6.-p.z)/(uLamp.z-p.z),0.,.99);
  float outer=smoothstep(-penumbra(tb,spread),penumbra(tb,spread),sdRect(mix(p.xy,uLamp.xy,tb),uOutside,uRound.y));
  float tw=(uZ.z-p.z)/(uLamp.z-p.z);
  vec2 u=mix(p.xy,uLamp.xy,tw);
  float din=-sdRect(u,uInside,uRound.x);
  float through=smoothstep(-penumbra(tw,spread),penumbra(tw,spread),din);
  float water=0.;
  if(through>0.){
    vec2 w=u;float h;vec2 g;vec3 hs;
    fieldAt(w,pxw,h,g,hs);w=u-Dc*g;
    fieldAt(w,pxw,h,g,hs);w=u-Dc*g;
    fieldAt(w,pxw,h,g,hs);
    float jxx=1.+Dc*hs.x;float jxy=Dc*hs.y;float jyy=1.+Dc*hs.z;
    float det=jxx*jyy-jxy*jxy;
    float eps=uEps.x+uEps.y*uMove+.02*pxw*uKNow;
    float lens=sqrt(1.+eps*eps)/sqrt(det*det+eps*eps);
    float foam=mix(uDip.w,1.,smoothstep(0.,uDip.z,din));
    water=lens*foam*uEps.w;
  }
  float pass=outer+through*water;
  float shade=rodLight(p,uPost.xy,uPost.z,uPost.w,spread);
  for(int i=0;i<4;i++)shade*=rodLight(p,legAt(i),uLeg.z,uLeg.w,spread);
  shade*=slabLight(p,uBar,uHeights.x,1.,spread)*slabLight(p,uBeam,uHeights.y,1.,spread)*slabLight(p,uMotor,uHeights.z,4.,spread);
  shade*=min(min(slabLight(p,uBox,uHeights.w,4.,spread),slabLight(p,uBox,uHeights.w*.5,4.,spread)),slabLight(p,uBox,1.,4.,spread));
  float onPaper=1.-smoothstep(-.7*pxf,.7*pxf,sdRect(p.xy,uPaper,uRound.z));
  float e=E*pass*shade*mix(uCone.w,uCone.z,onPaper);
  if(uLight<.5){
    vec3 c=tonemap(uInk*e,uExpo.w);
    float m=max(c.r,max(c.g,c.b));
    c=max(c+dither()*smoothstep(0.,1.5/255.,m),0.);
    gl_FragColor=vec4(c,max(c.r,max(c.g,c.b)))*uLampLevel*onBase;
  }else{
    float lit=1.-uExpo.x/(1.+pow(max(e,1e-6)/uExpo.y,uExpo.z));
    float a=(1.-mix(uOff,lit,uLampLevel))*onBase;
    a=max(a+dither()*smoothstep(0.,1.5/255.,a),0.);
    gl_FragColor=vec4(uInk*a,a);
  }
}`;

  const WATER = `${FIELD}
uniform vec4 uNear;
uniform vec4 uEnv;
uniform vec4 uGlass;
uniform vec4 uGlint;
uniform vec4 uTint;
uniform vec4 uWall;
uniform vec4 uBeamSpread;
uniform vec4 uSheen;
vec4 over(vec4 top,vec4 under){return top+under*(1.-top.a);}
float envOf(vec3 r){
  float sky=mix(uEnv.y,uEnv.x,smoothstep(uGlint.y-.5,uGlint.y+.6,r.z));
  float az=atan(r.y,r.x)-uGlint.x;
  az-=6.2831853*floor(az/6.2831853+.5);
  float el=asin(clamp(r.z,-1.,1.))-uGlint.y;
  float pane=(1.-smoothstep(uGlint.z*.7,uGlint.z,abs(az)))*(1.-smoothstep(uGlint.w*.7,uGlint.w,abs(el)));
  pane*=1.-.8*exp(-az*az/(uGlint.z*uGlint.z*.004));
  return sky+pane*uEnv.z;
}
float fresnel(float c){return .02+.98*pow(1.-clamp(c,0.,1.),5.);}
float bandOf(float z,float a,float b,float soft){return window(z,a,b,soft);}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  float px=pixelOf();
  float pxf=px/uCam.z;
  float pxw=px/uCam.w;
  vec3 V=towardViewer();
  vec4 acc=vec4(0.);
  vec3 glow=vec3(0.);
  // The water surface.
  vec3 ws=onFloor(vb,uZ.z);
  float din=-sdRect(ws.xy,uInside,uRound.x);
  float surf=smoothstep(-.7*pxf,.7*pxf,din);
  if(surf>0.){
    float h;vec2 g;vec3 hs;
    fieldAt(ws.xy,pxf,h,g,hs);
    vec2 rel=ws.xy-uInside.xy;
    vec2 toWall=max(uInside.zw-abs(rel),0.);
    vec2 slope=g+sign(rel)*(uWall.x/uWall.y)*exp(-toWall/uWall.y);
    vec3 n=normalize(vec3(-slope,1.));
    float lit=envOf(reflect(-V,n))*fresnel(dot(n,V));
    float flat0=envOf(reflect(-V,vec3(0.,0.,1.)))*fresnel(V.z);
    float ring=0.;
    float r1=length(ws.xy-uSrc.xy);float r2=length(ws.xy-uSrc.zw);
    float rw=.45+.6*pxf;
    ring+=exp(-pow((r1-uDip.y-.6)/rw,2.))+exp(-pow((r2-uDip.y-.6)/rw,2.));
    acc=over(vec4(uTint.rgb*uTint.a,uTint.a)*surf,acc);
    if(uLight<.5){
      glow+=vec3(max(flat0*uSheen.x+(lit-flat0)*uSheen.y,0.)+ring*uWall.z)*surf;
    }else{
      float d=clamp((lit-flat0)*uSheen.y,-uSheen.z,uSheen.w)*surf;
      vec4 ink=d>0.?vec4(vec3(d),d):vec4(0.,0.,0.,-d);
      acc=over(vec4(0.,0.,0.,min(ring*uWall.z,.6)*surf),over(ink,acc));
    }
  }
  // The water band and glass seen through the two near walls.
  vec3 wx=onWallX(vb,uNear.x);
  vec3 wy=onWallY(vb,uNear.y);
  float soft=.7*pxw;
  float spanX=window(wx.y,uInside.y-uInside.w,uInside.y+uInside.w+uGlass.w,soft);
  float spanY=window(wy.x,uInside.x-uInside.z,uInside.x+uInside.z+uGlass.w,soft);
  float wetX=bandOf(wx.z,uZ.w,uZ.z,soft)*spanX;
  float wetY=bandOf(wy.z,uZ.w,uZ.z,soft)*spanY;
  float dryX=bandOf(wx.z,uZ.z,uNear.z,soft)*spanX;
  float dryY=bandOf(wy.z,uZ.z,uNear.z,soft)*spanY;
  float lw=.35+.5*pxw;
  float lip=(exp(-pow((wx.z-uZ.z)/lw,2.))*spanX+exp(-pow((wy.z-uZ.z)/lw,2.))*spanY);
  float sole=(exp(-pow((wx.z-uZ.w)/lw,2.))*spanX+exp(-pow((wy.z-uZ.w)/lw,2.))*spanY);
  float wet=max(wetX,wetY);
  float dry=max(dryX,dryY);
  acc=over(vec4(uTint.rgb,1.)*(wet*uGlass.x+dry*uGlass.y),acc);
  acc=over(vec4(uInk,1.)*min(1.,lip*uGlass.z+sole*uGlass.z*.6),acc);
  // The lamp's beam, a faint cone of haze (dark only, scaled by uBeamSpread.z).
  vec3 p0=rayOf(vb);
  vec2 dv=V.xy;
  float tc=-dot(p0.xy-uLamp.xy,dv)/dot(dv,dv);
  vec3 c=p0+tc*V;
  float R=uBeamSpread.x+(uLamp.z-c.z)*uBeamSpread.y;
  float haze=exp(-dot(c.xy-uLamp.xy,c.xy-uLamp.xy)/(R*R))*window(c.z,uZ.z+30.,uLamp.z-14.,22.)*uBeamSpread.z*(uBeamSpread.x*6./(R+uBeamSpread.x*5.));
  glow+=uInk*haze;
  float jitter=dither();
  acc.rgb+=glow;
  float m=max(acc.r,max(acc.g,acc.b));
  acc.a=max(acc.a,m);
  acc=max(acc+jitter*smoothstep(0.,1.5/255.,acc.a),0.);
  gl_FragColor=acc*uLampLevel;
}`;

  const THEME = pale
    ? {
        ink: [0.07, 0.07, 0.08],
        cone: [0.86, 0.62, 1, 0.62],
        expo: [0, 0.4, 3, 1],
        off: 0.72,
        eps: [0.16, 0.9, 0.55, 0.92],
        env: [1, 0.35, 5, 0],
        sheen: [0, 26, 0.16, 0.5],
        glass: [0.1, 0.035, 0.22, 4],
        glint: [0, 0.77, 0.16, 0.11],
        tint: [0.5, 0.62, 0.7, 0.1],
        wall: [0.35, 2.7, 0.22, 0],
        beam: [20, 0.42, 0, 0],
      }
    : {
        ink: [1, 0.93, 0.82],
        cone: [0.86, 0.62, 1, 0.42],
        expo: [0, 1, 1, 0.78],
        off: 0,
        eps: [0.16, 0.9, 0.55, 0.92],
        env: [0.9, 0.1, 5, 0],
        sheen: [3, 30, 0, 0],
        glass: [0.14, 0.05, 0.3, 4],
        glint: [0, 0.77, 0.16, 0.11],
        tint: [0.05, 0.08, 0.11, 0.24],
        wall: [0.35, 2.7, 0.18, 0],
        beam: [20, 0.42, 0.05, 0],
      };
  // Put the window just beside the direction flat water reflects, so only the ripples' flanks catch it.
  {
    const [sinA, cosA] = D.camera.cam;
    THEME.glint[0] = Math.atan2(-sinA, -cosA) + 0.06 + THEME.glint[2];
  }

  const shared = {
    uZ: [D.z.paper, D.z.bed, D.z.water, D.z.floor],
    uInside: D.inside,
    uRound: D.round,
    uLamp: D.lamp,
    uDip: D.dip,
    uWave: [D.ka, D.reach, RANGES.k, RANGES.inv],
    uWave2: [RANGES.decay, RANGES.lag, D.optics.caustic, D.optics.magnification],
    uInk: THEME.ink,
    uLight: pale ? 1 : 0,
    uStep: D.step,
  };
  const PER_FRAME = ["uSrc", "uPhase", "uStep", "uInvCg", "uKNow", "uMove", "uLampLevel"];
  const view = [D.W, D.H];
  const canvasPaper = stage.querySelector(".rt-paper-gl");
  const canvasWater = stage.querySelector(".rt-water-gl");
  let layers = null;
  try {
    const paper = glLayer({
      canvas: canvasPaper,
      fragment: PAPER,
      view,
      camera: D.camera,
      uniforms: PER_FRAME,
      extensions: ["GL_OES_standard_derivatives"],
      fixed: {
        ...shared,
        uOutside: D.outside,
        uPaper: D.paper,
        uBase: D.base,
        uLeg: D.leg,
        uPost: D.post,
        uBar: D.bar,
        uBeam: D.beam,
        uMotor: D.motor,
        uBox: D.box,
        uHeights: D.heights,
        uCone: THEME.cone,
        uExpo: [1 - THEME.off, THEME.expo[1], THEME.expo[2], THEME.expo[3]],
        uEps: THEME.eps,
        uOff: THEME.off,
      },
    });
    const water = paper
      ? glLayer({
          canvas: canvasWater,
          fragment: WATER,
          view,
          camera: D.camera,
          uniforms: PER_FRAME,
          fixed: {
            ...shared,
            uNear: D.near,
            uEnv: THEME.env,
            uGlass: THEME.glass,
            uGlint: THEME.glint,
            uTint: THEME.tint,
            uWall: THEME.wall,
            uBeamSpread: THEME.beam,
            uSheen: THEME.sheen,
          },
        })
      : null;
    if (paper && water) {
      const textureFor = (gl) => {
        const texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, STEPS, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        return texture;
      };
      textureFor(paper.gl);
      textureFor(water.gl);
      layers = { paper, water };
      stage.setAttribute("data-gl", "");
    }
  } catch (error) {
    layers = null;
  }

  function upload(layer) {
    const gl = layer.gl;
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, STEPS, 2, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  }

  function drawGl(calm) {
    if (!layers) return;
    try {
      packHistory(calm);
      const values = {
        uSrc: [D.pattern.x, -gap.x / 2, D.pattern.x, gap.x / 2],
        uPhase: phase,
        uStep: D.step,
        uInvCg: 1 / (model.group * 1000),
        uKNow: model.k,
        uMove: calm ? 0 : move,
        uLampLevel: lamp,
      };
      if (lamp <= 0 && !pale) layers.paper.clear();
      else {
        upload(layers.paper);
        layers.paper.draw(values, 0);
      }
      if (lamp <= 0) layers.water.clear();
      else {
        upload(layers.water);
        layers.water.draw(values, 0);
      }
    } catch (error) {
      layers = null;
    }
  }

  // ---- SVG ----
  const shown = { readout: readout ? readout.textContent : "", f: D.start.f, d: D.start.d };
  const setAttr = (node, name, value) => {
    if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
  };
  const dialDir = (f) => {
    const a = ((-135 + (270 * (f - F0)) / (F1 - F0)) * Math.PI) / 180;
    return [Math.sin(a), -Math.cos(a)];
  };
  function drawSvg() {
    const bob = model.amplitude * Math.sin(phase);
    setAttr(parts.far, "transform", translateAlong(P, [0, -gap.x / 2, bob]));
    setAttr(parts.near, "transform", translateAlong(P, [0, gap.x / 2, bob]));
    setAttr(parts.bar, "transform", translateAlong(P, [0, 0, bob]));
    setAttr(parts.motor, "transform", translateAlong(P, [0, 0, bob]));
    const [ex, ey, ez, offset, radius] = D.eccentric;
    setAttr(parts.eccentric, "d", sideRing([ex, ey + offset * Math.cos(phase), ez + offset * Math.sin(phase)], radius, "x", P, 20));
    const [dx, dy] = dialDir(freq.x);
    const [kx, ky, kz, kr] = D.knob;
    setAttr(parts.pointer, "d", lineOnTop([kx + dx * 1.8, ky + dy * 1.8], [kx + dx * (kr - 1.2), ky + dy * (kr - 1.2)], kz + 0.01, P));
    const [mx, my, mz, ml] = D.meter;
    setAttr(parts.needle, "d", lineOnTop([mx - dx * 2, my - dy * 2], [mx + dx * ml, my + dy * ml], mz, P));
    stage.style.setProperty("--rt-lamp", lamp.toFixed(3));
    const text = readoutOf(model);
    if (readout && text !== shown.readout) {
      readout.textContent = text;
      shown.readout = text;
    }
    if (!layers && (Math.abs(freq.x - shown.f) > 0.01 || Math.abs(gap.x - shown.d) > 0.1)) {
      shown.f = freq.x;
      shown.d = gap.x;
      const { nodal, crests } = patternOf(model, D.pattern, (point) => iso(point, P), D.startPhase);
      setAttr(parts.nodal, "d", nodal);
      setAttr(parts.crests, "d", crests);
    }
  }

  // ---- Loop ----
  let frame = 0;
  let last = 0;
  let visible = false;
  function tick(now) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    const calm = still.matches;
    if (calm && touring) touring = false;
    if (touring) {
      tourClock += dt;
      blendClock += dt;
      const [tf, td] = tourAt(tourClock);
      const share = smooth(0, 2.4, blendClock);
      state.tf = clampF(tourFrom[0] + (tf - tourFrom[0]) * share);
      state.td = clampD(tourFrom[1] + (td - tourFrom[1]) * share);
    }
    const movingF = settle(freq, state.tf, dt, 0.625, calm);
    const movingD = settle(gap, state.td, dt, 0.4, calm);
    if (freq.x !== model.f || gap.x !== model.d) model = stateOf(freq.x, gap.x, D.optics);
    if (!calm) {
      simTime += dt;
      phase = (phase + TAU * D.beat * dt) % TAU;
      truePhase += TAU * freq.x * dt;
      move = Math.min(1.5, Math.abs(model.k - lastK) * 120);
    } else move = 0;
    lastK = model.k;
    if (layers) {
      if (calm) lamp = 1;
      else {
        lampClock += dt;
        lamp = smooth(0, 1, (lampClock - 0.15) / 0.9);
      }
    }
    drawSvg();
    drawGl(calm);
    const busy = touring || movingF || movingD || !calm || (layers && lamp < 1);
    frame = visible && busy ? requestAnimationFrame(tick) : 0;
  }
  function run() {
    if (!frame && visible) {
      last = 0;
      frame = requestAnimationFrame(tick);
    }
  }
  new IntersectionObserver(
    (entries) => {
      visible = entries[entries.length - 1].isIntersecting;
      if (visible) run();
    },
    { rootMargin: "120px 0px" },
  ).observe(stage);
  addEventListener("resize", run);
  const onMotion = () => {
    if (still.matches) {
      touring = false;
      clearTimeout(tourTimer);
    } else {
      clearTimeout(tourTimer);
      tourTimer = setTimeout(beginTour, 1400);
    }
    run();
  };
  if (still.addEventListener) still.addEventListener("change", onMotion);
})();
