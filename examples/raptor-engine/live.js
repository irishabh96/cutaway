// Raptor 2 test stand: explode springs, depth re-sorting, selection, idle tour, ignition and the two WebGL layers.
// Inlined after the kit's WebGL module, so glLayer, smooth, burst and settle are already in scope.
const RAPTOR = __DATA__;

(() => {
  const D = RAPTOR;
  const stage = document.querySelector(".rp-stage");
  if (!stage) return;
  const plate = stage.closest(".iso-plate");
  const figure = stage.closest(".rp");
  const engine = stage.querySelector(".rp-engine");
  const glowGroup = stage.querySelector(".rp-glow-g");
  const readoutEl = plate.querySelector("[data-readout]");
  const liveEl = plate.querySelector("[data-live]");
  const fireBtn = plate.querySelector("[data-fire]");
  const fireLabel = plate.querySelector("[data-fire-label]");
  const hintEl = plate.querySelector(".rp-hint");
  const partBtns = [...figure.querySelectorAll(".rp-part")];
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const narrow = matchMedia("(hover: none), (max-width: 480px)");
  const lightTheme = document.body.dataset.theme === "light" || Boolean(stage.closest('[data-theme="light"]'));
  const ORDER = D.parts.map((p) => p.id);
  const fmt = (n) => Math.round(n).toLocaleString("en-US");

  // ---------------------------------------------------------------- items and their screen motion
  const cam = D.cam;
  const toScreen = ([x, y, z]) => [(x * cam.sinA - y * cam.cosA) * cam.k, ((x * cam.cosA + y * cam.sinA) * cam.sinE - z * cam.cosE) * cam.k];
  const nodes = [...engine.querySelectorAll(":scope > .it")].map((el, index) => {
    const m = el.dataset.m.split(",").map(Number);
    return { el, index, key: Number(el.dataset.k), lift: m[0] * D.view[0] + m[1] * D.view[1] + m[2] * D.view[2], screen: toScreen(m), ride: el.dataset.ride || el.dataset.piece, piece: el.dataset.piece, still: !m[0] && !m[1] && !m[2], shown: "" };
  });
  const byPiece = new Map();
  for (const node of nodes) {
    if (!byPiece.has(node.piece)) byPiece.set(node.piece, []);
    byPiece.get(node.piece).push(node);
  }

  // ---------------------------------------------------------------- one spring per assembly, staggered
  const springs = Object.fromEntries(D.stagger.map((id) => [id, { x: 0, v: 0, target: 0, pending: null }]));
  let clock = 0;
  let apart = false;
  function setApart(value) {
    if (value === apart) return;
    apart = value;
    const goal = value ? 1 : 0;
    const list = value ? D.stagger : [...D.stagger].reverse();
    let index = 0;
    for (const id of list) {
      const spring = springs[id];
      if (spring.target === goal) spring.pending = null;
      else spring.pending = { value: goal, at: clock + (still.matches ? 0 : index++ * D.spring.stagger) };
    }
    describe();
    kick();
  }
  function stepSprings(dt, calm) {
    let moving = false;
    for (const spring of Object.values(springs)) {
      if (spring.pending && clock >= spring.pending.at - 1e-9) {
        spring.target = spring.pending.value;
        spring.pending = null;
      }
      if (spring.pending) moving = true;
      if (calm) {
        spring.x = spring.target;
        spring.v = 0;
        continue;
      }
      const h = dt / D.spring.substeps;
      for (let i = 0; i < D.spring.substeps; i++) {
        spring.v += ((spring.target - spring.x) * D.spring.stiffness - spring.v * D.spring.damping) * h;
        spring.x += spring.v * h;
      }
      if (Math.abs(spring.target - spring.x) < 5e-4 && Math.abs(spring.v) < 5e-4) {
        spring.x = spring.target;
        spring.v = 0;
      } else moving = true;
    }
    return moving;
  }
  const settled = () => Object.values(springs).every((s) => !s.pending && s.x === s.target && s.v === 0);
  const allHome = () => Object.values(springs).every((s) => !s.pending && s.target === 0 && s.x === 0 && s.v === 0);

  let lastOrder = nodes.map((n) => n.index).join(",");
  function place() {
    for (const node of nodes) {
      if (node.still) continue;
      const share = springs[node.ride]?.x ?? 0;
      const text = share ? `translate(${(node.screen[0] * share).toFixed(2)} ${(node.screen[1] * share).toFixed(2)})` : "";
      if (text === node.shown) continue;
      node.shown = text;
      if (text) node.el.setAttribute("transform", text);
      else node.el.removeAttribute("transform");
    }
    const sorted = [...nodes].sort((a, b) => a.key + a.lift * (springs[a.ride]?.x ?? 0) - (b.key + b.lift * (springs[b.ride]?.x ?? 0)) || a.index - b.index);
    const order = sorted.map((n) => n.index).join(",");
    if (order !== lastOrder) {
      lastOrder = order;
      const fragment = document.createDocumentFragment();
      for (const node of sorted) fragment.appendChild(node.el);
      engine.appendChild(fragment);
    }
  }

  // ---------------------------------------------------------------- selection, readout and value text
  let selected = null;
  function select(id) {
    const next = id && id !== "stand" && ORDER.includes(id) ? id : null;
    if (next === selected) return;
    selected = next;
    for (const node of nodes) node.el.toggleAttribute("data-on", node.piece === selected);
    stage.toggleAttribute("data-focus", Boolean(selected));
    for (const btn of partBtns) btn.toggleAttribute("data-on", btn.dataset.part === selected);
    stage.setAttribute("aria-valuenow", String(selected ? ORDER.indexOf(selected) + 1 : 0));
    describe();
  }
  const lineOf = (id) => D.parts.find((p) => p.id === id)?.line ?? "";

  // ---------------------------------------------------------------- burn state
  const burn = {
    state: "cold", // cold | arming | lit | shutdown
    t: 0, tour: false, mainAt: null, shutAt: null, popAt: null, popped: false, said: "",
    pc: { x: 0, v: 0 }, hue: { x: 0, v: 0 }, steam: { x: 0, v: 0 }, vapour: { x: 0, v: 0 }, glow: 1.15, frozen: null,
  };
  const burning = () => burn.state !== "cold";
  function announce(text) {
    if (liveEl && burn.said !== text) liveEl.textContent = burn.said = text;
  }
  function ignite(fromTour = false) {
    if (burning()) return shutdown();
    burn.tour = fromTour;
    select(null);
    setApart(false);
    burn.state = "arming";
    burn.t = 0;
    burn.mainAt = burn.shutAt = burn.popAt = null;
    burn.popped = false;
    burn.frozen = null;
    fireBtn.dataset.state = "armed";
    fireLabel.textContent = "Shut down";
    announce("arming");
    describe();
    kick();
  }
  function shutdown() {
    if (burn.state === "cold") return;
    if (burn.state === "arming") return coldNow();
    if (burn.state === "shutdown") return;
    burn.state = "shutdown";
    burn.shutAt = burn.t;
    burn.frozen = burn.glow;
    announce("shutdown");
    kick();
  }
  function coldNow() {
    const wasTour = burn.tour;
    burn.state = "cold";
    burn.tour = false;
    delete fireBtn.dataset.state;
    fireLabel.textContent = "Ignite";
    announce("cold");
    describe();
    if (wasTour && touring) tourNext();
  }
  function pressureTarget() {
    if (burn.state === "shutdown") return 0;
    if (burn.t < 0.7) return 0;
    if (burn.t < 1.25) return 0.13;
    return 1;
  }
  function stepBurn(dt, calm) {
    if (burn.state === "cold" && burn.pc.x === 0 && burn.steam.x === 0 && burn.vapour.x === 0 && burn.hue.x === 0) return false;
    if (burn.state === "arming") {
      if (!allHome()) return true;
      burn.state = "lit";
      burn.t = calm ? 1.3 : 0;
      fireBtn.dataset.state = "on";
      announce(calm ? "main stage" : "chill-down, venting");
    }
    const lit = burn.state === "lit";
    if (lit || burn.state === "shutdown") burn.t += dt;
    if (lit && burn.t >= 0.7 && burn.t < 1.25) announce("preburners lit");
    if (lit && burn.t >= 1.25 && burn.mainAt === null) {
      burn.mainAt = burn.t;
      announce("main stage");
    }
    if (lit && burn.mainAt !== null && burn.t - burn.mainAt > (burn.tour ? 4.2 : 9)) shutdown();
    const target = pressureTarget();
    const stiffness = burn.state === "shutdown" ? 6 : target > 0.5 ? 20 : 64;
    const w = Math.sqrt(stiffness);
    if (calm) {
      burn.pc.x = target;
      burn.pc.v = 0;
    } else {
      for (let i = 0; i < 4; i++) {
        const h = dt / 4;
        burn.pc.v += (w * w * (target - burn.pc.x) - 2 * w * burn.pc.v) * h;
        burn.pc.x += burn.pc.v * h;
      }
      burn.pc.x = Math.max(0, burn.pc.x);
      if (Math.abs(target - burn.pc.x) < 1e-4 && Math.abs(burn.pc.v) < 1e-4) {
        burn.pc.x = target;
        burn.pc.v = 0;
      }
    }
    const on = burn.state === "lit" || burn.state === "shutdown";
    settle(burn.hue, on && burn.state === "lit" && burn.pc.x > 0.2 ? 1 : 0, dt, burn.state === "lit" ? 0.32 : 0.5, calm);
    settle(burn.steam, burn.state === "lit" && burn.mainAt !== null ? 1 : 0, dt, burn.state === "lit" ? 1.6 : 3.2, calm);
    settle(burn.vapour, burn.state === "lit" && burn.t < 0.9 ? 1 : 0, dt, 0.35, calm);
    if (burn.state === "lit") burn.glow = 1.15 - 0.15 * burn.hue.x;
    if (burn.state === "shutdown" && !burn.popped && burn.pc.x < 0.2 && burn.mainAt !== null) {
      burn.popped = true;
      burn.popAt = burn.t;
    }
    if (burn.state === "shutdown" && burn.pc.x < 2e-3 && burn.t - burn.shutAt >= 0.9) coldNow();
    return burn.state !== "cold" || burn.pc.x > 1e-3 || burn.steam.x > 1e-3 || burn.vapour.x > 1e-3 || burn.hue.x > 1e-3;
  }
  const bar = () => burn.pc.x * D.facts.chamberBar;
  const thrust = () => Math.max(0, (D.facts.thrustTf + D.facts.backTf) * burn.pc.x - D.facts.backTf);
  function readoutText() {
    if (burn.state === "arming") return "closing up · arming";
    if (burn.state === "lit") {
      if (burn.t < 0.7) return "chill-down · venting";
      if (burn.t < 1.25) return `spin-up · preburners lit · ${fmt(bar())} bar`;
      return `Pc ${fmt(bar())} bar · ${fmt(thrust())} tf`;
    }
    if (burn.state === "shutdown") return burn.pc.x > 0.01 ? `shutdown · ${fmt(bar())} bar` : "shutdown · purging";
    if (selected) return lineOf(selected);
    if (!settled()) return apart ? "taking apart" : "closing up";
    return apart ? `apart · ${ORDER.length} assemblies` : D.cold;
  }
  let said = readoutEl ? readoutEl.textContent : "";
  function say() {
    const text = readoutText();
    if (text !== said && readoutEl) readoutEl.textContent = said = text;
  }
  let described = stage.getAttribute("aria-valuetext") ?? "";
  function describe() {
    const text = selected ? lineOf(selected) : burning() ? "firing" : apart ? `apart · ${ORDER.length} assemblies` : "Assembled, cold";
    if (text !== described) stage.setAttribute("aria-valuetext", (described = text));
  }

  // ---------------------------------------------------------------- the WebGL layers
  const E = D.gl;
  const f1 = (v) => Number(v).toFixed(2);
  const FRAGMENT = `
uniform float uPc;uniform float uPre;uniform float uHue;uniform float uGlow;uniform float uFlash;uniform float uPop;
uniform float uSteam;uniform float uVapour;uniform float uSplash;uniform float uReach;uniform vec2 uShock;uniform vec2 uRing;
uniform float uVeil;uniform float uLight;
const float ZX=${f1(E.exitZ)};const float RX=${f1(E.exitR)};const float DH=${f1(E.deckHalf)};const float DR=${f1(E.deckR)};
const float CPR=${f1(E.plateR)};const float CPH=${f1(E.plateH)};const float CR=${f1(E.coneR)};const float CH=${f1(E.coneH)};
const float TR=${f1(E.torusR)};const float TT=${f1(E.torusTube)};const float TZ=${f1(E.torusZ)};
const float COL=${f1(E.col)};const float CHALF=${f1(E.colHalf)};const float CTOP=${f1(E.colTop)};const float BOUND=132.;
float bellR(float z){float s=z-ZX;return s<-2.?0.:s<116.?65.-.1822*s-.000956*s*s+3.:s<212.?40.:s<290.?31.:s<312.?25.:0.;}
float ground(vec2 q){float r=length(q);float h=0.;
  h=max(h,CPH*(1.-smoothstep(CPR-.6,CPR+.6,r)));
  float x=clamp(r/CR,0.,1.);h=max(h,r<CR?CPH+CH*(1.-pow(x,1.25)):0.);
  float dt=abs(r-TR);if(dt<TT)h=max(h,TZ+sqrt(TT*TT-dt*dt));
  return h;}
float onDeck(vec2 q){vec2 a=abs(q)-vec2(DH-DR);float d=length(max(a,0.))+min(max(a.x,a.y),0.)-DR;return 1.-smoothstep(-1.,1.,d);}
float boxHit(vec3 o,vec3 v,vec2 c){vec3 lo=vec3(c-CHALF,0.);vec3 hi=vec3(c+CHALF,CTOP);vec3 a=(lo-o)/v;vec3 b=(hi-o)/v;vec3 t1=min(a,b);vec3 t2=max(a,b);
  float tn=max(max(t1.x,t1.y),t1.z);float tf=min(min(t2.x,t2.y),t2.z);return tf>=tn?tf:-1e9;}
float frontOf(vec3 p,vec3 v){float R=bellR(p.z);if(R<=0.)return 0.;vec2 h=v.xy;float hh=dot(h,h);float b=dot(p.xy,h);float c=dot(p.xy,p.xy)-R*R;float disc=b*b-hh*c;
  if(disc<=0.)return 0.;float tn=(-b+sqrt(disc))/hh;return smoothstep(-2.,2.,-tn);}
float side(float f){return mix(1.-f,f,uVeil);}
float beyond(float tc,float tLow,float sigma){return 1./(1.+exp(2.41*(tLow-tc)/sigma));}
vec4 inkFor(vec3 seen,float cover){vec3 ab=1.-seen;float a=max(max(ab.r,max(ab.g,ab.b)),cover);return vec4(vec3(a)-ab,a);}
vec4 over(vec4 top,vec4 under){return top+under*(1.-top.a);}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec3 V=towardViewer();
  vec3 g0=rayOf(vb);
  float px=pixelOf();
  // first opaque hit: the deck heightfield (plate, cone, deluge ring), then the columns
  float tTop=(ZX+8.-g0.z)/V.z;float tBot=(-1.-g0.z)/V.z;
  float tLow=-1e9;vec3 hit=vec3(0.);float hitDeck=0.;
  float ta=tTop;float stp=(tTop-tBot)/28.;
  for(int i=0;i<28;i++){float tb=ta-stp;vec3 p=g0+V*tb;if(p.z<ground(p.xy)&&onDeck(p.xy)>.5){float lo=tb;float hi=ta;
    for(int j=0;j<7;j++){float m=.5*(lo+hi);vec3 q=g0+V*m;if(q.z<ground(q.xy))lo=m;else hi=m;}
    tLow=hi;hit=g0+V*hi;hitDeck=1.;break;}ta=tb;}
  if(hitDeck<.5){float td=(0.-g0.z)/V.z;vec3 q=g0+V*td;if(onDeck(q.xy)>.5){tLow=td;hit=q;hitDeck=1.;}}
  float tCol=max(boxHit(g0,V,vec2(-COL,COL)),boxHit(g0,V,vec2(COL,-COL)));
  tLow=max(tLow,tCol);
  float colHit=step(tLow-.01,tCol)*step(-1e8,tCol);
  vec3 mainE=vec3(0.);vec3 emberE=vec3(0.);float core=0.;float haze=0.;float hazeWarm=0.;vec3 lightE=vec3(0.);
  float tim=uTime;
  // exhaust volume, bounded by a cylinder from the ground to the exit plane
  if(uPc+uPre>.0005&&uVeil<.5){
    vec2 h=V.xy;float hh=dot(h,h);float b=dot(g0.xy,h);float c=dot(g0.xy,g0.xy)-BOUND*BOUND;float disc=b*b-hh*c;
    if(disc>0.){float t0=(-b-sqrt(disc))/hh;float t1=(-b+sqrt(disc))/hh;
      float tz0=(0.-g0.z)/V.z;float tz1=(ZX-g0.z)/V.z;
      float a=max(max(t0,tz0),tLow);float e=min(t1,tz1);
      if(e>a){float dt=(e-a)/28.;float jit=hash12(gl_FragCoord.xy+fract(tim*.37)*61.);
        for(int i=0;i<28;i++){float t=a+(float(i)+jit)*dt;vec3 p=g0+V*t;float s=ZX-p.z;float r=length(p.xy);
          float reach=uReach*(ZX-CPH);
          float rj=RX*(.78+.0042*s)+max(0.,24.-p.z)*1.9*uPc;
          float len=1.-smoothstep(reach*.82,reach*1.02+6.,s);
          float edge=1.-smoothstep(BOUND-26.,BOUND-4.,r);
          float n=fbm3(vec3(p.xy*.045,s*.03-tim*2.4));
          float rag=mix(.75,1.25,n);
          float body=exp(-pow(r/(rj*rag),2.)*1.6)*len*edge;
          float axis=exp(-pow(r/(rj*.42),2.)*2.)*(1.-smoothstep(0.,reach*.6,s))*len;
          float cells=0.;for(int k=1;k<5;k++){float sc=float(k)*31.;cells+=exp(-pow((s-sc)/2.6,2.))*exp(-pow(r/(rj*.38),2.));}
          float w=dt*.866/(rj*1.772+1.);
          float axisW=mix(1.,1.35-.55*smoothstep(0.,rj,r),uLight);
          mainE+=vec3(.42,.36,1.)*body*axisW*w*uPc*2.4+vec3(.9,.86,1.)*cells*w*uPc*1.6;
          core+=axis*w*uPc*3.4;
          float tongue=exp(-pow(r/(RX*(.5+.004*s)),2.))*(1.-smoothstep(0.,60.+40.*n,s))*edge;
          emberE+=vec3(1.,.48,.16)*tongue*w*uPre*2.4;}}}
  }
  // the ignition flash and the shutdown pop: a glow ball just under the exit
  vec3 C=vec3(0.,0.,ZX-8.);float tc=dot(C-g0,V);float d=length(g0+V*tc-C);
  float vis=beyond(tc,tLow,30.);
  if(uVeil<.5){mainE+=vec3(.8,.78,1.)*uFlash*exp(-pow(d/70.,2.))*vis*1.4;emberE+=vec3(1.,.55,.2)*uPop*exp(-pow(d/48.,2.))*vis*1.6;}
  // the shock: a real sphere expanding from just above the exit, two roots, split by the engine proxy
  if(uShock.y>.001){vec3 Cs=vec3(0.,0.,ZX+6.);float tcs=dot(Cs-g0,V);float ds=length(g0+V*tcs-Cs);float rs=uShock.x;float wv=7.;
    if(ds<rs+wv){float q=max(rs*rs-ds*ds,0.);float lim=rs*wv/sqrt(q+2.*rs*wv);float sq=sqrt(q);
      for(int k=0;k<2;k++){float tr=tcs+(k==0?sq:-sq);vec3 p=g0+V*tr;float above=smoothstep(-4.,6.,p.z-ground(p.xy));float seen=step(tLow,tr);
        float f=frontOf(p,V);mainE+=vec3(.78,.8,1.)*pow(min(lim/6.,1.),2.)*uShock.y*above*seen*side(f)*.55;}}}
  // ground: splash of the jet on the cone and deck, the ground ring, and the warm wash on the deluge ring
  if(hitDeck>.5&&uVeil<.5&&colHit<.5){float r=length(hit.xy);
    vec2 e2=vec2(.6,0.);vec3 nrm=normalize(vec3(ground(hit.xy-e2.xy)-ground(hit.xy+e2.xy),ground(hit.xy-e2.yx)-ground(hit.xy+e2.yx),1.2));
    vec3 toJet=normalize(vec3(-hit.xy,max(ZX*.4-hit.z,8.)));float lam=max(dot(nrm,toJet),0.);
    float splash=uSplash*exp(-r/72.)*(.35+.65*lam)*onDeck(hit.xy);
    lightE+=mix(vec3(1.,.55,.25),vec3(.62,.58,1.),uHue)*splash*.9;
    float ring=uRing.y*exp(-pow((r-uRing.x)/9.,2.))*onDeck(hit.xy);lightE+=vec3(.85,.85,1.)*ring*.5;}
  // steam and chill-down vapour: low clouds over the deck, each sample on exactly one canvas
  if(uSteam+uVapour>.0005){float tz0=(0.-g0.z)/V.z;float tz1=(110.-g0.z)/V.z;float a=max(tz0,tLow);float e=tz1;
    if(e>a){float dt=(e-a)/6.;float jit=.5+.06*(hash12(gl_FragCoord.yx+fract(tim*.61)*43.)-.5);
      for(int i=0;i<6;i++){float t=a+(float(i)+jit)*dt;vec3 p=g0+V*t;float r=length(p.xy);
        float shell=smoothstep(40.,80.,r)*(1.-smoothstep(150.,DH*1.25,r))*onDeck(p.xy*.92);
        float height=exp(-p.z/(26.+40.*uSteam))*smoothstep(-2.,6.,p.z-ground(p.xy));
        vec3 drift=vec3(normalize(p.xy+.001)*tim*9.,-tim*6.);
        float n=fbm3(p*.025-drift*.025);float dens=smoothstep(.32,.78,n)*shell*height;
        float vent=uVapour*exp(-pow((p.z-ZX+40.)/40.,2.))*exp(-pow(r/(RX*1.2),2.))*fbm3(p*.05+vec3(0.,0.,tim*1.5));
        float f=frontOf(p,V);float wgt=side(f)*dt*.016;haze+=(dens*uSteam*1.5+vent*1.4)*wgt;hazeWarm+=dens*uSteam*uPc*wgt;}}}
  // compose
  vec4 outc;
  if(uLight<.5){vec3 col=(mainE*mix(.55,1.,uHue)+emberE)*uGlow+vec3(1.,.97,1.)*core*uGlow+lightE+vec3(.27,.28,.31)*haze+vec3(.6,.35,.25)*hazeWarm*.4;
    col=tonemap(col,1.15);float m=max(col.r,max(col.g,col.b));
    float nz=(hash12(gl_FragCoord.xy+fract(tim*.61)*91.)+hash12(gl_FragCoord.yx*1.37+fract(tim*.37)*57.)-1.)/255.;
    col=max(col+nz*smoothstep(0.,1.5/255.,m),0.);outc=vec4(col,max(col.r,max(col.g,col.b)));}
  else{float eM=1.-exp(-2.2*max(mainE.b,max(mainE.r,mainE.g))*uGlow);float eE=1.-exp(-2.4*max(emberE.r,emberE.g)*uGlow);float eC=1.-exp(-2.*core*uGlow);
    vec3 violet=mix(vec3(.93,.92,1.),vec3(.42,.34,.95),smoothstep(.1,.9,eM));violet=mix(violet,vec3(.98,.97,1.),smoothstep(.3,.8,eC));
    vec4 bodyInk=inkFor(violet,.92*smoothstep(.4,.85,eC))*smoothstep(0.,.1,max(eM,eC));
    vec3 ember=mix(vec3(1.,.93,.85),vec3(.95,.42,.08),smoothstep(.04,.55,eE));ember=mix(ember,vec3(1.,.86,.5),smoothstep(.7,.95,eE));
    vec4 emberInk=inkFor(ember,.85*smoothstep(.6,.95,eE))*smoothstep(0.,.08,eE);
    float lm=1.-exp(-1.6*max(lightE.r,max(lightE.g,lightE.b)));vec3 tint=mix(vec3(.99,.74,.5),vec3(.74,.7,.99),uHue);
    vec4 tintInk=vec4(tint*lm*.32,lm*.32);tintInk.rgb=vec3(tintInk.a)-(1.-tint)*tintInk.a;
    float ha=1.-exp(-haze*3.);vec3 grey=mix(vec3(.86,.88,.91),vec3(.95,.9,.84),clamp(hazeWarm*4.,0.,.4));vec4 hazeInk=inkFor(grey,ha)*ha;
    outc=over(emberInk,over(bodyInk,over(hazeInk,tintInk)));outc.rgb=min(outc.rgb,vec3(outc.a));
    float nz=(hash12(gl_FragCoord.xy+fract(tim*.61)*91.)-.5)/255.;outc=max(outc+nz*smoothstep(0.,1.5/255.,outc.a),0.);outc.rgb=min(outc.rgb,vec3(outc.a));}
  gl_FragColor=outc;
}`;
  const UNIFORMS = ["uPc", "uPre", "uHue", "uGlow", "uFlash", "uPop", "uSteam", "uVapour", "uSplash", "uReach", "uShock", "uRing"];
  const makeLayer = (selector, veil) => {
    const canvas = stage.querySelector(selector);
    return canvas ? glLayer({ canvas, fragment: FRAGMENT, view: [D.W, D.H], camera: D.camera, uniforms: UNIFORMS, fixed: { uVeil: veil, uLight: lightTheme ? 1 : 0 }, extensions: [] }) : null;
  };
  const plume = makeLayer(".rp-plume", 0);
  const veil = plume ? makeLayer(".rp-veil", 1) : null;
  if (plume) stage.setAttribute("data-gl", "");
  stage.style.setProperty("--gx", `${D.flash[0]}%`);
  stage.style.setProperty("--gy", `${D.flash[1]}%`);

  let lastUniforms = "";
  let shown = false;
  let force = false;
  function paint(calm) {
    const since = burn.mainAt === null ? -1 : burn.t - burn.mainAt;
    const pc = burn.pc.x;
    const pre = burn.state === "lit" && burn.t >= 0.7 ? smooth(0.6, 1.0, burn.t) * (1 - smooth(0, 0.25, pc - 0.13) * 0.6) : 0;
    const preLeg = burn.state === "shutdown" ? Math.min(1, pc * 4) * (1 - burn.hue.x) : pre;
    const flash = calm ? 0 : burn.mainAt !== null ? burst(since, 0.08, 0.13) : 0;
    const shock = calm ? 0 : burn.mainAt !== null ? burst(since - 0.02, 0.06, 0.3) : 0;
    const ring = calm ? 0 : burn.mainAt !== null ? burst(since - 0.12, 0.1, 0.45) : 0;
    const pop = calm || burn.popAt === null ? 0 : burst(burn.t - burn.popAt, 0.08, 0.3);
    const glow = burn.state === "shutdown" && burn.frozen !== null ? burn.frozen : burn.glow;
    const values = {
      uPc: pc,
      uPre: preLeg,
      uHue: burn.hue.x,
      uGlow: glow,
      uFlash: flash,
      uPop: pop,
      uSteam: burn.steam.x,
      uVapour: burn.vapour.x,
      uSplash: pc * Math.sqrt(pc),
      uReach: 0.35 + 0.65 * pc,
      uShock: [calm ? 0 : 20 + Math.max(0, since) * 420, shock],
      uRing: [calm ? 0 : 40 + Math.max(0, since - 0.12) * 260, ring],
    };
    const active = pc + preLeg + flash + shock + ring + pop + burn.steam.x + burn.vapour.x > 1e-3;
    // the SVG glow and deck tint answer the burn with or without WebGL
    const rim = Math.min(1, pc * 0.9 + preLeg * 0.6 + flash * 0.8 + pop * 0.7);
    const deck = Math.min(1, pc * values.uSplash * 0.9 + flash * 0.6 + preLeg * 0.35 + pop * 0.5);
    stage.style.setProperty("--rim", rim.toFixed(3));
    stage.style.setProperty("--deck-glow", deck.toFixed(3));
    const flashVeil = stage.querySelector(".rp-flash");
    if (flashVeil) flashVeil.style.opacity = (flash * 0.32).toFixed(3);
    const shake = calm ? 0 : burst(since, 0.05, 0.22) * 3;
    stage.style.transform = shake > 0.02 ? `translate(${(Math.sin(burn.t * 91) * shake).toFixed(2)}px, ${(Math.cos(burn.t * 77) * shake).toFixed(2)}px)` : "";
    const hum = calm ? 0 : pc * 0.35;
    const jitter = hum > 0.01 ? `translate(${(Math.sin(burn.t * 173) * hum).toFixed(2)} ${(Math.cos(burn.t * 151) * hum).toFixed(2)})` : "";
    for (const g of [engine, glowGroup]) if (g) jitter ? g.setAttribute("transform", jitter) : g.removeAttribute("transform");
    if (!plume) return active;
    if (!active) {
      if (shown) {
        plume.clear();
        veil?.clear();
        shown = false;
      }
      return false;
    }
    const time = calm ? 0.8 : burn.t;
    const json = JSON.stringify(values);
    if (calm && json === lastUniforms && shown && !force) return active;
    lastUniforms = json;
    force = false;
    plume.draw(values, time);
    if (veil) burn.steam.x + burn.vapour.x + shock > 1e-3 ? veil.draw(values, time) : veil.clear();
    shown = true;
    return active;
  }

  // ---------------------------------------------------------------- idle tour
  let touring = false;
  let tourStep = 0;
  let tourAt = 0;
  let resume = 0;
  let pointerInside = false;
  const TOUR = [
    { hold: 0.4, run: () => (select(null), setApart(false)) },
    { hold: 0.9, run: () => setApart(true) },
    ...ORDER.map((id) => ({ hold: 1.5, run: () => (setApart(true), select(id)) })),
    { hold: 1.4, run: () => (select(null), setApart(false)) },
    { hold: Infinity, run: () => ignite(true) },
  ];
  function startTour() {
    resume = 0;
    if (still.matches || pointerInside) return;
    if (burning()) {
      resume = setTimeout(startTour, 3600);
      return;
    }
    touring = true;
    tourStep = 0;
    tourAt = 0;
    TOUR[0].run();
    kick();
  }
  function tourNext() {
    tourStep = 0;
    tourAt = 0;
    TOUR[0].run();
    kick();
  }
  function stepTour(dt) {
    if (!touring) return false;
    tourAt += dt;
    while (tourAt >= TOUR[tourStep].hold) {
      tourAt -= TOUR[tourStep].hold;
      tourStep = Math.min(TOUR.length - 1, tourStep + 1);
      TOUR[tourStep].run();
    }
    return true;
  }
  function takeOver() {
    if (touring) {
      touring = false;
      if (burn.tour) burn.tour = false;
    }
    clearTimeout(resume);
    resume = still.matches ? 0 : setTimeout(startTour, 3600);
  }

  // ---------------------------------------------------------------- the loop
  let frame = 0;
  let last = 0;
  let visible = false;
  function tick(now) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    const calm = still.matches;
    clock += dt;
    const touringNow = stepTour(dt);
    const moving = stepSprings(dt, calm);
    place();
    const firing = stepBurn(dt, calm);
    const glowing = paint(calm);
    say();
    const busy = moving || touringNow || firing || glowing || burn.state === "arming";
    frame = visible && busy ? requestAnimationFrame(tick) : 0;
  }
  function kick() {
    if (!frame && visible) {
      last = 0;
      frame = requestAnimationFrame(tick);
    }
  }
  new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) kick();
  }, { rootMargin: "120px 0px" }).observe(stage);
  addEventListener("resize", () => {
    force = true;
    lastUniforms = "";
    kick();
  });

  // ---------------------------------------------------------------- input
  const pieceAt = (x, y) => {
    const hit = document.elementFromPoint(x, y);
    const item = hit && hit.closest ? hit.closest(".rp-front .it") : null;
    const piece = item ? item.dataset.piece : null;
    return piece === "stand" ? null : piece;
  };
  let leaveTimer = 0;
  const closeSoon = () => {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      if (pointerInside || burning()) return;
      if (partBtns.some((b) => b.matches(":hover") || b.matches(":focus-visible"))) return;
      select(null);
      setApart(false);
    }, 260);
  };
  stage.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    pointerInside = true;
    takeOver();
    if (burning()) return;
    setApart(true);
    select(pieceAt(event.clientX, event.clientY));
  });
  stage.addEventListener("pointerenter", (event) => {
    if (event.pointerType !== "touch") pointerInside = true;
  });
  stage.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "touch") return;
    pointerInside = false;
    takeOver();
    closeSoon();
  });
  stage.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    takeOver();
    if (burning()) return;
    const piece = pieceAt(event.clientX, event.clientY);
    if (piece) {
      setApart(true);
      select(piece);
    } else {
      select(null);
      setApart(!apart);
    }
  });
  for (const btn of partBtns) {
    const open = () => {
      takeOver();
      if (burning()) return;
      clearTimeout(leaveTimer);
      setApart(true);
      select(btn.dataset.part);
    };
    btn.addEventListener("pointerenter", open);
    btn.addEventListener("focus", open);
    btn.addEventListener("click", open);
    btn.addEventListener("pointerleave", () => (takeOver(), closeSoon()));
    btn.addEventListener("blur", () => (takeOver(), closeSoon()));
  }
  fireBtn.addEventListener("click", () => {
    takeOver();
    burning() ? shutdown() : ignite(false);
  });
  stage.addEventListener("keydown", (event) => {
    const key = event.key;
    const step = (by) => {
      if (burning()) return;
      const at = selected ? ORDER.indexOf(selected) : -1;
      const next = at < 0 ? 0 : Math.max(0, Math.min(ORDER.length - 1, at + by));
      setApart(true);
      select(ORDER[next]);
    };
    let handled = true;
    if (key === "ArrowRight" || key === "ArrowDown") step(1);
    else if (key === "ArrowLeft" || key === "ArrowUp") step(-1);
    else if (key === "Home") !burning() && (setApart(true), select(ORDER[0]));
    else if (key === "End") !burning() && (setApart(true), select(ORDER[ORDER.length - 1]));
    else if (key === "i" || key === "I" || key === "Enter") burning() ? shutdown() : ignite(false);
    else if (key === " ") {
      if (!burning()) {
        setApart(!apart);
        if (!apart) select(null);
      }
    } else if (key === "Escape") {
      shutdown();
      select(null);
      setApart(false);
    } else handled = false;
    if (handled) {
      event.preventDefault();
      takeOver();
    }
  });
  stage.addEventListener("focus", () => {
    if (liveEl && !liveEl.textContent) liveEl.textContent = burning() ? "firing" : "cold";
  });
  const hint = () => {
    if (hintEl) hintEl.textContent = narrow.matches ? "Tap to take apart" : "Hover the engine to take it apart";
  };
  narrow.addEventListener?.("change", hint);
  hint();

  // ---------------------------------------------------------------- start
  place();
  say();
  describe();
  if (!still.matches) startTour();
  kick();
})();
