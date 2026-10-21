import * as THREE from 'three';
import { PALETTE, MM } from './config.js';
import { MANIFOLD } from './cadGeometry.js';

export const SHEET = { w: 12.6, h: 12.6 / Math.SQRT2, px: 2048 };
const W = SHEET.px;
const H = Math.round(SHEET.px / Math.SQRT2);
const K = W / SHEET.w;

const X = (x) => (x / SHEET.w + 0.5) * W;
const Z = (z) => (z / SHEET.h + 0.5) * H;

function line(ctx, pts, { w = 2, color = PALETTE.ink, dash = null } = {}) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.setLineDash(dash || []);
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  ctx.setLineDash([]);
}

function circle(ctx, x, y, r, opts = {}) {
  ctx.strokeStyle = opts.color || PALETTE.ink;
  ctx.lineWidth = opts.w || 2;
  ctx.setLineDash(opts.dash || []);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

const CHAIN = [26, 6, 4, 6];
const HIDDEN = [10, 6];

function arrowDim(ctx, x1, y1, x2, y2, text, offset = 0) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const nx = -Math.sin(a) * offset;
  const ny = Math.cos(a) * offset;
  const A = [x1 + nx, y1 + ny];
  const B = [x2 + nx, y2 + ny];
  line(ctx, [[x1, y1], [A[0] + nx * 0.15, A[1] + ny * 0.15]], { w: 1 });
  line(ctx, [[x2, y2], [B[0] + nx * 0.15, B[1] + ny * 0.15]], { w: 1 });
  line(ctx, [A, B], { w: 1.2 });
  [[A, a], [B, a + Math.PI]].forEach(([[px, py], ang]) => {
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(ang + 0.25) * 16, py + Math.sin(ang + 0.25) * 16);
    ctx.lineTo(px + Math.cos(ang - 0.25) * 16, py + Math.sin(ang - 0.25) * 16);
    ctx.fill();
  });
  ctx.save();
  ctx.translate((A[0] + B[0]) / 2, (A[1] + B[1]) / 2);
  ctx.rotate(Math.abs(a) > Math.PI / 2 ? a + Math.PI : a);
  ctx.fillStyle = PALETTE.ink;
  ctx.font = '600 20px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, 0, -8);
  ctx.restore();
}

function crosshair(ctx, x, y, r = 22) {
  circle(ctx, x, y, r, { w: 1.5 });
  line(ctx, [[x - r * 1.7, y], [x + r * 1.7, y]], { w: 1.5 });
  line(ctx, [[x, y - r * 1.7], [x, y + r * 1.7]], { w: 1.5 });
}

function text(ctx, s, x, y, size = 18, weight = 400, color = PALETTE.ink, align = 'left') {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "JetBrains Mono", monospace`;
  ctx.textAlign = align;
  ctx.fillText(s, x, y);
}

function topView(ctx) {
  const { w, d, bore, tap, pcd, mount } = MANIFOLD;
  const cx = X(0);
  const cy = Z(0);
  const r = 0.22 * K;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.roundRect(X(-w / 2), Z(-d / 2), w * K, d * K, r);
  ctx.stroke();
  [[1.75, 1.25], [-1.75, 1.25], [-1.75, -1.25], [1.75, -1.25]].forEach(([x, z]) => circle(ctx, X(x), Z(z), mount * K, { w: 2.4 }));
  [[pcd, pcd], [-pcd, pcd], [-pcd, -pcd], [pcd, -pcd]].forEach(([x, z]) => {
    circle(ctx, X(x), Z(z), tap * K, { w: 2 });
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(X(x), Z(z), 0.075 * K, 0.2, Math.PI * 1.7);
    ctx.stroke();
  });
  circle(ctx, cx, cy, 1.62 * K, { w: 2.6 });
  circle(ctx, cx, cy, 1.36 * K, { w: 1, dash: HIDDEN });
  circle(ctx, cx, cy, 1.3 * K, { w: 2.2 });
  circle(ctx, cx, cy, 1.12 * K, { w: 1.2, dash: HIDDEN });
  circle(ctx, cx, cy, 0.775 * K, { w: 1.2, dash: HIDDEN });
  circle(ctx, cx, cy, bore * K, { w: 1.2, dash: HIDDEN });
  circle(ctx, cx, cy, 0.375 * K, { w: 2.4 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-a);
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(0.58 * K, -0.08 * K, 0.55 * K, 0.16 * K, 0.08 * K);
    ctx.stroke();
    ctx.restore();
  }
  circle(ctx, cx, cy, Math.SQRT2 * pcd * K, { w: 1.2, color: PALETTE.blue, dash: CHAIN });
  line(ctx, [[X(-w / 2 - 0.4), cy], [X(w / 2 + 0.4), cy]], { w: 1.2, color: PALETTE.blue, dash: CHAIN });
  line(ctx, [[cx, Z(-d / 2 - 0.4)], [cx, Z(d / 2 + 0.4)]], { w: 1.2, color: PALETTE.blue, dash: CHAIN });
  arrowDim(ctx, X(-w / 2), Z(d / 2), X(w / 2), Z(d / 2), `${(w * MM).toFixed(0)}`, 64);
  arrowDim(ctx, X(w / 2), Z(-d / 2), X(w / 2), Z(d / 2), `${(d * MM).toFixed(0)}`, -64);
  text(ctx, '4× M6×1.0 ▽12', X(pcd) + 26, Z(-pcd) - 26, 19, 600);
  line(ctx, [[X(pcd) + 6, Z(-pcd) - 6], [X(pcd) + 24, Z(-pcd) - 22], [X(pcd) + 180, Z(-pcd) - 22]], { w: 1.2 });
  text(ctx, 'TOP VIEW  1:1', cx, Z(d / 2) + 118, 20, 700, PALETTE.ink, 'center');
}

function elevation(ctx, ox, oy, width, label) {
  const s = K * 0.5;
  const rect = (x, y, w, h, opts) => {
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = opts?.w || 2.4;
    ctx.strokeRect(ox + x * s, oy - (y + h) * s, w * s, h * s);
  };
  rect(-width / 2, 0, width, 1.4);
  rect(-1.62, 1.4, 3.24, 0.25);
  rect(-1.12, 1.65, 2.24, 1.35);
  rect(-1.3, 3.22, 2.6, 0.24);
  rect(-0.375, 3.46, 0.75, 0.24);
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox + 0.6 * s, oy - 1.65 * s, 1.02 * s, 0.25 * s);
  ctx.rect(ox + 0.6 * s, oy - 3.0 * s, 0.52 * s, 1.35 * s);
  ctx.clip();
  for (let i = -60; i < 60; i++) line(ctx, [[ox + i * 9, oy], [ox + i * 9 + 600, oy - 600]], { w: 1, color: PALETTE.blue });
  ctx.restore();
  line(ctx, [[ox - 0.6 * s, oy], [ox - 0.6 * s, oy - 2.8 * s]], { w: 1.2, dash: HIDDEN });
  line(ctx, [[ox + 0.6 * s, oy], [ox + 0.6 * s, oy - 2.8 * s]], { w: 1.2, dash: HIDDEN });
  line(ctx, [[ox, oy + 30], [ox, oy - 4.1 * s]], { w: 1.2, color: PALETTE.blue, dash: CHAIN });
  arrowDim(ctx, ox - 0.6 * s, oy - 2.4 * s, ox + 0.6 * s, oy - 2.4 * s, 'Ø48 H7', 0);
  text(ctx, label, ox, oy + 62, 20, 700, PALETTE.ink, 'center');
}

function titleBlock(ctx) {
  const x = W - 640;
  const y = H - 210;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, 580, 150);
  ctx.lineWidth = 1.5;
  [50, 100].forEach((dy) => line(ctx, [[x, y + dy], [x + 580, y + dy]], { w: 1.5 }));
  line(ctx, [[x + 330, y], [x + 330, y + 150]], { w: 1.5 });
  text(ctx, 'CNC-MANIFOLD-V4', x + 14, y + 33, 20, 700);
  text(ctx, 'DWG CD-2026-8841', x + 344, y + 33, 18, 600);
  text(ctx, 'MAT SUS304', x + 14, y + 83, 17);
  text(ctx, 'REV D  ·  SHEET 1/4', x + 344, y + 83, 17);
  text(ctx, 'TOL ISO 2768-m', x + 14, y + 133, 17);
  text(ctx, 'SCALE 1:1 · 1st ANGLE', x + 344, y + 133, 17);
}

export function blueprintTexture() {
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PALETTE.sheet;
  ctx.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += K / 8) line(ctx, [[x, 0], [x, H]], { w: 1, color: 'rgba(0,82,255,0.06)' });
  for (let y = 0; y < H; y += K / 8) line(ctx, [[0, y], [W, y]], { w: 1, color: 'rgba(0,82,255,0.06)' });
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, W - 48, H - 48);
  ctx.lineWidth = 4;
  ctx.strokeRect(56, 56, W - 112, H - 112);
  for (let i = 0; i < 8; i++) {
    const x = 56 + ((W - 112) / 8) * (i + 0.5);
    text(ctx, String(i + 1), x, 47, 18, 600, PALETTE.ink, 'center');
    text(ctx, String(i + 1), x, H - 30, 18, 600, PALETTE.ink, 'center');
    if (i) {
      line(ctx, [[56 + ((W - 112) / 8) * i, 24], [56 + ((W - 112) / 8) * i, 56]], { w: 1.5 });
      line(ctx, [[56 + ((W - 112) / 8) * i, H - 56], [56 + ((W - 112) / 8) * i, H - 24]], { w: 1.5 });
    }
  }
  'ABCDEF'.split('').forEach((l, i) => {
    const y = 56 + ((H - 112) / 6) * (i + 0.5) + 6;
    text(ctx, l, 40, y, 18, 600, PALETTE.ink, 'center');
    text(ctx, l, W - 40, y, 18, 600, PALETTE.ink, 'center');
  });
  [[110, 110], [W - 110, 110], [110, H - 110], [W - 110, H - 110], [W / 2, 90], [W / 2, H - 90]].forEach(([x, y]) => crosshair(ctx, x, y));

  topView(ctx);
  elevation(ctx, X(-4.6), Z(1.6), MANIFOLD.w, 'FRONT ELEVATION  1:2');
  elevation(ctx, X(4.7), Z(1.0), MANIFOLD.d, 'SIDE ELEVATION  1:2');

  text(ctx, 'NOTES:', 120, 190, 20, 700);
  ['1. DEBURR ALL EDGES, BREAK 0.2', '2. UNLESS OTHERWISE SPECIFIED: ISO 2768-m', '3. Ra 1.6 ALL MACHINED SURFACES', '4. BORE Ø48 H7  ⌖ Ø0.02 | A | B'].forEach((n, i) =>
    text(ctx, n, 120, 222 + i * 28, 17),
  );
  const rx = W - 560;
  ctx.lineWidth = 2;
  ctx.strokeStyle = PALETTE.ink;
  ctx.strokeRect(rx, 90, 470, 120);
  ['REV  DESCRIPTION              DATE', 'B    BORE TOL H8 → H7        2024-03', 'C    M8 → M6 FASTENERS       2025-07', 'D    CHAMFER 0.5×45° ADDED   2026-10'].forEach((r, i) =>
    text(ctx, r, rx + 14, 118 + i * 27, 16, i ? 400 : 700, i === 3 ? PALETTE.red : PALETTE.ink),
  );
  titleBlock(ctx);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  return tex;
}

export function brushedTexture() {
  const s = 512;
  const canvas = Object.assign(document.createElement('canvas'), { width: s, height: s });
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(s, s);
  for (let y = 0; y < s; y++) {
    let row = 200 + Math.random() * 40;
    for (let x = 0; x < s; x++) {
      row += (Math.random() - 0.5) * 6;
      row = Math.min(250, Math.max(185, row));
      const v = row + (Math.random() - 0.5) * 10;
      const i = (y * s + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.anisotropy = 8;
  return tex;
}
