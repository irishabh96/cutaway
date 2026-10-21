
const NOTE = { C5: 523.25, E5: 659.25, G5: 783.99, B5: 987.77, D6: 1174.66 };

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.lastTick = 0;
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  async init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyser.smoothingTimeConstant = 0.7;
    this.bins = new Uint8Array(this.analyser.frequencyBinCount);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    this.bus = ctx.createGain();
    this.bus.connect(comp).connect(this.master);
    this.master.connect(ctx.destination);
    this.master.connect(this.analyser);

    this.send = ctx.createGain();
    const dl = ctx.createDelay(1);
    const dr = ctx.createDelay(1);
    dl.delayTime.value = 0.18;
    dr.delayTime.value = 0.27;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 5200;
    const merge = ctx.createChannelMerger(2);
    this.send.connect(tone).connect(dl);
    dl.connect(dr);
    dr.connect(fb).connect(dl);
    dl.connect(merge, 0, 0);
    dr.connect(merge, 0, 1);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    merge.connect(wet).connect(this.bus);

    this.noise = this.makeNoise();
    await ctx.resume();
    this.startDrone();
  }

  setEnabled(on) {
    this.enabled = on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, t, 0.08);
  }

  spectrum() {
    if (!this.analyser) return null;
    this.analyser.getByteFrequencyData(this.bins);
    return this.bins;
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  env(gain, t, attack, peak, decay) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  voice(type, freq, pan = 0) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    osc.connect(g).connect(p).connect(this.bus);
    return { osc, g, p };
  }

  noiseSource(t, duration) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.start(t, Math.random());
    src.stop(t + duration + 0.05);
    return src;
  }

  startDrone() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    lp.Q.value = 0.7;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.11, t + 4);
    lp.connect(out).connect(this.bus);
    [
      [60, 'sine', -0.6, -4], [60, 'sine', 0.6, 4],
      [120, 'triangle', -0.4, -6], [120, 'triangle', 0.4, 6],
      [180, 'sine', 0, 0],
    ].forEach(([f, type, pan, cents], i) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f;
      osc.detune.value = cents;
      const g = ctx.createGain();
      g.gain.value = [0.5, 0.5, 0.22, 0.22, 0.06][i];
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      osc.connect(g).connect(p).connect(lp);
      osc.start(t);
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const depth = ctx.createGain();
    depth.gain.value = 140;
    lfo.connect(depth).connect(lp.frequency);
    lfo.start(t);
  }

  powerUp() {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.02;
    const { osc, g } = this.voice('sawtooth', 55);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(200, t);
    lp.frequency.exponentialRampToValueAtTime(6000, t + 0.9);
    osc.disconnect();
    osc.connect(lp).connect(g);
    osc.frequency.setValueAtTime(55, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.9);
    this.env(g, t, 0.6, 0.18, 0.5);
    osc.start(t);
    osc.stop(t + 1.2);
    this.snap(t + 0.95, 0.9);
    [NOTE.C5, NOTE.G5].forEach((f, i) => this.bell(f, t + 1.0 + i * 0.06, (i ? 1 : -1) * 0.3, 0.12));
  }

  scanSweep(duration, up = true) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const [f0, f1] = up ? [300, 1800] : [1800, 300];
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 7;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + duration);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.32, t + 0.15);
    ng.gain.setValueAtTime(0.32, t + duration - 0.25);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    this.noiseSource(t, duration).connect(bp).connect(ng).connect(this.bus);

    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const idx = ctx.createGain();
    car.frequency.setValueAtTime(f0, t);
    car.frequency.exponentialRampToValueAtTime(f1, t + duration);
    mod.frequency.setValueAtTime(f0 * 0.5, t);
    mod.frequency.exponentialRampToValueAtTime(f1 * 0.5, t + duration);
    idx.gain.value = 140;
    mod.connect(idx).connect(car.frequency);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, t);
    cg.gain.exponentialRampToValueAtTime(0.05, t + 0.2);
    cg.gain.setValueAtTime(0.05, t + duration - 0.3);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(-0.5, t);
    pan.pan.linearRampToValueAtTime(0.5, t + duration);
    car.connect(cg).connect(pan).connect(this.bus);
    [car, mod].forEach((o) => {
      o.start(t);
      o.stop(t + duration + 0.05);
    });
  }

  snap(at = null, level = 1) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = at ?? ctx.currentTime + 0.005;
    const pan = (Math.random() - 0.5) * 0.6;
    const { osc, g } = this.voice('triangle', 180, pan);
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.14);
    this.env(g, t, 0.004, 0.55 * level, 0.2);
    osc.start(t);
    osc.stop(t + 0.3);

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const hg = ctx.createGain();
    this.env(hg, t, 0.001, 0.16 * level, 0.06);
    hp.connect(hg).connect(this.bus);
    [2, 3, 4.16, 5.43, 6.79, 8.21].forEach((r) => {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 40 * r * 10;
      o.connect(hp);
      o.start(t);
      o.stop(t + 0.08);
    });
    this.noiseSource(t, 0.03).connect(hp);
  }

  tick() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (now - this.lastTick < 0.016) return;
    this.lastTick = now;
    const { osc, g } = this.voice('square', 2500, (Math.random() - 0.5) * 0.4);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.06, now + 0.0008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.005);
    osc.start(now);
    osc.stop(now + 0.01);
  }

  bell(freq, t, pan = 0, level = 0.09, decay = 2.4) {
    const ctx = this.ctx;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const idx = ctx.createGain();
    car.frequency.value = freq;
    mod.frequency.value = freq * 3.5;
    idx.gain.setValueAtTime(freq * 2.2, t);
    idx.gain.exponentialRampToValueAtTime(freq * 0.05, t + decay * 0.6);
    mod.connect(idx).connect(car.frequency);
    const g = ctx.createGain();
    this.env(g, t, 0.004, level, decay);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    car.connect(g).connect(p);
    p.connect(this.bus);
    p.connect(this.send);
    [car, mod].forEach((o) => {
      o.start(t);
      o.stop(t + decay + 0.1);
    });
  }

  matchChord() {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.02;
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.B5, NOTE.D6].forEach((f, i) => this.bell(f, t + i * 0.075, -0.6 + i * 0.3, 0.085, 2.8));
    this.bell(NOTE.C5 / 2, t, 0, 0.06, 3.2);
  }

  confirm() {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.01;
    this.bell(1046.5, t, -0.2, 0.06, 2.0);
    this.bell(1567.98, t + 0.09, 0.2, 0.045, 2.2);
  }

  ping(index = 0) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.01;
    const pan = [-0.5, 0.5, -0.25, 0.25][index % 4];
    [1200, 1600].forEach((f, i) => {
      const { osc, g, p } = this.voice('sine', f, pan);
      this.env(g, t + i * 0.012, 0.003, 0.09, 1.1);
      p.connect(this.send);
      osc.start(t);
      osc.stop(t + 1.3);
    });
  }

  hover() {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.002;
    const { osc, g } = this.voice('sine', 1800);
    this.env(g, t, 0.0008, 0.035, 0.025);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  uiClick(strong = false) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.002;
    const { osc, g } = this.voice('triangle', strong ? 880 : 1320);
    osc.frequency.exponentialRampToValueAtTime(strong ? 440 : 990, t + 0.05);
    this.env(g, t, 0.002, strong ? 0.12 : 0.06, 0.07);
    osc.start(t);
    osc.stop(t + 0.12);
    if (strong) {
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(600, t);
      bp.frequency.exponentialRampToValueAtTime(3200, t + 0.25);
      const ng = this.ctx.createGain();
      this.env(ng, t, 0.04, 0.08, 0.22);
      this.noiseSource(t, 0.3).connect(bp).connect(ng).connect(this.bus);
    }
  }
}
