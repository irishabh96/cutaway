import { STAGES, BOM, LOOP, MM, PALETTE } from './config.js';

const $ = (s) => document.querySelector(s);

export class Hud {
  constructor() {
    this.handlers = { stage: () => {}, mode: () => {}, sound: () => {} };
    this.stageIdx = -1;
    this.fps = 60;
    this.frame = 0;
    this.roiShown = -1;

    $('#stages').innerHTML = STAGES.map(
      (s, i) => `<button type="button" data-i="${i}"><kbd>${i + 1}</kbd><span>${s.code}. ${s.label}</span><i aria-hidden="true"><em></em></i></button>`,
    ).join('');
    $('#bom-rows').innerHTML = BOM.map(
      (p) => `<tr data-id="${p.id}"><td>${p.item}</td><td>${p.name}</td><td>${p.mat}</td><td>${p.qty}</td><td>$${p.cost.toFixed(2)}</td></tr>`,
    ).join('');
    this.stageBtns = [...document.querySelectorAll('#stages button')];
    this.stageBars = this.stageBtns.map((b) => b.querySelector('em'));
    this.bomRows = [...document.querySelectorAll('#bom-rows tr')];
    this.tip = $('#tooltip');
    this.viz = $('#viz').getContext('2d');
    this.el = {
      stage: $('#tb-stage'), sheet: $('#tb-sheet'), hrs: $('#roi-hrs'), cost: $('#roi-cost'),
      fps: $('#t-fps'), time: $('#t-time'), scan: $('#t-scan'), draw: $('#t-draw'),
    };

    this.stageBtns.forEach((b) => b.addEventListener('click', () => this.handlers.stage(+b.dataset.i)));
    $('#mode').addEventListener('click', () => this.handlers.mode());
    $('#sound').addEventListener('click', () => this.handlers.sound());
  }

  on(evt, fn) {
    this.handlers[evt] = fn;
  }

  toggle() {
    document.getElementById('hud').classList.toggle('hidden');
  }

  setLooping(looping) {
    const b = $('#mode');
    b.setAttribute('aria-pressed', String(looping));
    b.classList.toggle('hold', !looping);
    b.querySelector('.txt').textContent = looping ? 'AUTO-LOOP' : 'PRESENTER HOLD';
    b.querySelector('small').textContent = looping ? '/ PRESENTER HOLD' : '/ AUTO-LOOP';
  }

  setSound(on) {
    const b = $('#sound');
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('off', !on);
    b.querySelector('.txt').textContent = on ? 'SOUND: ON' : 'SOUND: OFF';
  }

  inspect(hit, screen) {
    this.bomRows.forEach((r) => r.classList.toggle('hot', !!hit && r.dataset.id === hit.part.spec.id));
    if (!hit) {
      this.tip.hidden = true;
      return;
    }
    const s = hit.part.spec;
    const f = hit.feature;
    const cls = f.heat > 0.7 ? 'r' : f.heat > 0.45 ? 'a' : '';
    this.tip.innerHTML = `<header><i>${s.item}</i>${s.name}</header>
      <div class="row"><span>P/N</span><b>${s.pn}</b></div>
      <div class="row"><span>MAT</span><b>${s.mat}</b></div>
      <div class="row feat"><span>FEATURE</span><b>${f.name}</b></div>
      <div class="row"><span>TOL</span><b>${f.tol}</b></div>
      <div class="row"><span>COST Δ</span><b class="${cls}">${f.cost}</b></div>
      <div class="row"><span>SUPPLIER</span><b>${s.supplier}</b></div>
      <div class="row"><span>UNIT</span><b class="g">$${s.cost.toFixed(2)} · ${s.lead}</b></div>`;
    this.tip.hidden = false;
    this.move(screen);
  }

  move(screen) {
    const x = Math.min(screen.x + 18, window.innerWidth - 290);
    const y = Math.min(screen.y + 18, window.innerHeight - 200);
    this.tip.style.transform = `translate(${x}px, ${y}px)`;
  }

  drawSpectrum(bins, enabled) {
    const g = this.viz;
    const { width: w, height: h } = g.canvas;
    g.clearRect(0, 0, w, h);
    const n = 18;
    const bw = w / n;
    for (let i = 0; i < n; i++) {
      const v = bins && enabled ? bins[Math.floor((i / n) ** 1.6 * bins.length * 0.7)] / 255 : 0;
      const bh = Math.max(1, v * h);
      g.fillStyle = v > 0.6 ? PALETTE.red : PALETTE.ink;
      g.fillRect(i * bw, h - bh, bw - 1, bh);
    }
  }

  update({ time, dt, renderer, scanY, roi, bins, soundOn }) {
    this.frame++;
    this.fps += ((dt > 0 ? 1 / dt : 60) - this.fps) * 0.05;
    const idx = STAGES.reduce((cur, s, i) => (time >= s.start ? i : cur), 0);
    const stage = STAGES[idx];
    if (idx !== this.stageIdx) {
      this.stageIdx = idx;
      this.stageBtns.forEach((b, i) => {
        b.classList.toggle('on', i === idx);
        b.classList.toggle('done', i < idx);
        if (i === idx) b.setAttribute('aria-current', 'step');
        else b.removeAttribute('aria-current');
      });
      this.el.stage.textContent = `${stage.code} · ${stage.label}`;
      this.el.sheet.textContent = `${idx + 1} / ${STAGES.length}`;
    }
    const local = Math.min(1, (time - stage.start) / (stage.end - stage.start));
    this.stageBars.forEach((em, i) => (em.style.width = `${i < idx ? 100 : i === idx ? local * 100 : 0}%`));
    if (roi !== this.roiShown) {
      this.roiShown = roi;
      this.el.hrs.textContent = Math.round(100000 * roi).toLocaleString('en-US');
      this.el.cost.textContent = `${Math.round(30 * roi)}%`;
    }
    this.drawSpectrum(bins, soundOn);

    if (this.frame % 6) return;
    this.el.fps.textContent = this.fps.toFixed(1);
    this.el.time.textContent = `${time.toFixed(2)} / ${LOOP.toFixed(0)}s`;
    this.el.scan.textContent = scanY > 50 ? 'RAW' : scanY < 0 ? 'STRUCTURED' : `y=${(scanY * MM).toFixed(1)}mm`;
    this.el.draw.textContent = `${renderer.info.render.calls} · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tri`;
  }
}
