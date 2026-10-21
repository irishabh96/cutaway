#!/usr/bin/env node
// Draws the README artwork (masthead, title block, comparison, pipeline, rule, social preview) in both themes.
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = ".github/assets/readme";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const SANS = "system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

const THEMES = {
  light: {
    paper: "#f5f3ed", sheet: "#fbfbfa", ink: "#252b2b", line: "#4f5c53", grey: "#757b77", faint: "#d8d9cf", grid: "#e6e5dc",
    top: "#fbfbfa", left: "#d8d9cf", right: "#c5cabd", baseTop: "#dddfd4", baseSide: "#bac3b3",
    sage: "#e3e8d9", sageL: "#c9d2bd", sageR: "#b5bfa8", rust: "#c94a2d", rustTop: "#d64d2f", rustL: "#ae3828", rustR: "#933024",
  },
  dark: {
    paper: "#141818", sheet: "#1a1f1f", ink: "#ecebe4", line: "#9aa59b", grey: "#8b918c", faint: "#323a39", grid: "#202626",
    top: "#2b3232", left: "#1f2525", right: "#181d1d", baseTop: "#232a29", baseSide: "#323b39",
    sage: "#33403a", sageL: "#27312c", sageR: "#1f2723", rust: "#e0694b", rustTop: "#e0694b", rustL: "#b14a32", rustR: "#8e3a27",
  },
};

const r = (n) => Math.round(n * 10) / 10;
const C30 = Math.cos(Math.PI / 6);

function iso(cx, cy, s = 1) {
  return (x, y, z) => [cx + (x - y) * C30 * s, cy + (x + y) * 0.5 * s - z * s];
}

function poly(points, fill, stroke, width = 1) {
  return `<path d="M${points.map(([x, y]) => `${r(x)} ${r(y)}`).join("L")}Z" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"/>`;
}

function slab(P, x, y, z, w, d, h, tones, stroke, width = 1) {
  const [x1, y1, z1] = [x + w, y + d, z + h];
  return [
    poly([P(x, y1, z), P(x1, y1, z), P(x1, y1, z1), P(x, y1, z1)], tones[1], stroke, width),
    poly([P(x1, y, z), P(x1, y1, z), P(x1, y1, z1), P(x1, y, z1)], tones[2], stroke, width),
    poly([P(x, y, z1), P(x1, y, z1), P(x1, y1, z1), P(x, y1, z1)], tones[0], stroke, width),
  ].join("");
}

function text(x, y, body, { size = 12, fill, family = MONO, weight = 400, anchor = "start", spacing = 0 } = {}) {
  const ls = spacing ? ` letter-spacing="${spacing}"` : "";
  return `<text x="${r(x)}" y="${r(y)}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${ls}>${body}</text>`;
}

function svg(width, height, label, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${label}">${body}</svg>\n`;
}

function sheetFrame(t, width, height, { columns = 6, rows = 3, rx = 10 } = {}) {
  const out = [`<rect width="${width}" height="${height}" rx="${rx}" fill="${t.paper}"/>`];
  out.push(`<rect x="14.5" y="14.5" width="${width - 29}" height="${height - 29}" fill="none" stroke="${t.line}" stroke-width="1"/>`);
  out.push(`<rect x="28.5" y="28.5" width="${width - 57}" height="${height - 57}" fill="none" stroke="${t.ink}" stroke-width="1.5"/>`);
  const cw = (width - 57) / columns;
  for (let i = 0; i < columns; i++) {
    const cx = 28.5 + cw * (i + 0.5);
    if (i) for (const y of [[14.5, 28.5], [height - 28.5, height - 14.5]]) out.push(`<path d="M${r(28.5 + cw * i)} ${y[0]}V${y[1]}" stroke="${t.line}" stroke-width="1"/>`);
    out.push(text(cx, 25, String(i + 1), { size: 9, fill: t.grey, anchor: "middle" }));
    out.push(text(cx, height - 18, String(i + 1), { size: 9, fill: t.grey, anchor: "middle" }));
  }
  const rh = (height - 57) / rows;
  for (let i = 0; i < rows; i++) {
    const cy = 28.5 + rh * (i + 0.5) + 3;
    if (i) for (const x of [[14.5, 28.5], [width - 28.5, width - 14.5]]) out.push(`<path d="M${x[0]} ${r(28.5 + rh * i)}H${x[1]}" stroke="${t.line}" stroke-width="1"/>`);
    const letter = String.fromCharCode(65 + i);
    out.push(text(21.5, cy, letter, { size: 9, fill: t.grey, anchor: "middle" }));
    out.push(text(width - 21.5, cy, letter, { size: 9, fill: t.grey, anchor: "middle" }));
  }
  return out.join("");
}

function grid(t, x, y, w, h, step = 24) {
  const id = `g${w}x${h}`;
  return `<defs><pattern id="${id}" x="${x}" y="${y}" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path d="M${step} 0H0V${step}" fill="none" stroke="${t.grid}" stroke-width="1"/></pattern></defs><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${id})"/>`;
}

// The exploded orchestrator: a base and three plates, each carrying three modules.
function stack(t, cx, cy, s, { callouts = true, labelX } = {}) {
  const P = iso(cx, cy, s);
  const size = 100, half = size / 2, gap = 54, thick = 7;
  const out = [];
  const plate = (z, tones) => slab(P, -half, -half, z, size, size, thick, tones, t.line, 1.1);
  const module = (x, z, tones) => slab(P, x - 13, -13, z + thick, 26, 26, 11, tones, t.line, 1);
  const plain = [t.top, t.left, t.right];
  const sage = [t.sage, t.sageL, t.sageR];
  const rust = [t.rustTop, t.rustL, t.rustR];
  out.push(slab(P, -half - 8, -half - 8, -10, size + 16, size + 16, 10, [t.baseTop, t.baseSide, t.baseSide], t.line, 1.1));
  const layers = [
    { z: gap * 0.6, tones: [sage, sage, sage], label: "INTAKE · PLANNER · ROUTER" },
    { z: gap * 1.6, tones: [plain, plain, plain], label: "WORKERS A · B · C" },
    { z: gap * 2.6, tones: [plain, rust, plain], label: "MERGE · REVIEW · OUTPUT" },
  ];
  for (const layer of layers) {
    out.push(plate(layer.z, plain));
    [-32, 0, 32].forEach((x, i) => out.push(module(x, layer.z, layer.tones[i])));
  }
  const [ax, ay] = P(-half, -half, layers[2].z + thick);
  const [, by] = P(half + 8, half + 8, -10);
  out.push(`<path d="M${r(ax)} ${r(ay - 8 * s)}V${r(ay - 40 * s)}M${r(ax)} ${r(by + 8 * s)}V${r(by + 30 * s)}" stroke="${t.rust}" stroke-width="1" stroke-dasharray="3 4"/>`);
  if (callouts) {
    const lines = [...layers.map((l) => ({ z: l.z, label: l.label })), { z: -10, label: "KIT · ISO CAMERA" }];
    for (const { z, label } of lines) {
      const [px, py] = P(half + (z < 0 ? 8 : 0), -half - (z < 0 ? 8 : 0), z + (z < 0 ? 5 : thick / 2));
      const ex = labelX ?? cx + (size + 16) * C30 * s + 26;
      out.push(`<circle cx="${r(px)}" cy="${r(py)}" r="2.2" fill="${t.ink}"/><path d="M${r(px)} ${r(py)}H${r(ex - 6)}" stroke="${t.line}" stroke-width=".8"/>`);
      out.push(text(ex, py + 4, label, { size: 12, fill: t.grey, spacing: 1 }));
    }
    const [lx, ly1] = P(-half, half, layers[1].z + thick);
    const [, ly2] = P(-half, half, layers[2].z);
    const dx = lx - 22 * s;
    out.push(`<path d="M${r(dx)} ${r(ly1)}V${r(ly2)}M${r(dx - 4)} ${r(ly1)}H${r(dx + 4)}M${r(dx - 4)} ${r(ly2)}H${r(dx + 4)}" stroke="${t.line}" stroke-width=".8"/>`);
    out.push(text(dx - 8, (ly1 + ly2) / 2 + 3.5, "OPEN", { size: 11, fill: t.rust, anchor: "end", spacing: 1 }));
  }
  return out.join("");
}

function masthead(t) {
  const W = 1280, H = 440;
  return svg(W, H, "Cutaway. See inside the systems you build.", [
    sheetFrame(t, W, H),
    grid(t, 760, 44, 476, 352),
    text(72, 86, "SHEET 01 / 01 &#160;·&#160; INTERACTIVE SYSTEM STUDIES", { size: 14, fill: t.grey, spacing: 2 }),
    text(62, 214, "cutaway", { size: 124, fill: t.ink, family: SANS, weight: 600, spacing: -6 }),
    `<rect x="72" y="246" width="10" height="10" fill="${t.rust}"/>`,
    text(94, 256, "See inside the systems you build.", { size: 21, fill: t.rust }),
    text(72, 300, "An agent skill that explains a system by opening it up:", { size: 18, fill: t.grey, family: SANS }),
    text(72, 326, "software, infrastructure, AI agents and machines as cutaways.", { size: 18, fill: t.grey, family: SANS }),
    `<path d="M72 362.5H700" stroke="${t.faint}"/>`,
    text(72, 384, "SVG · SVG + WEBGL · 3D BETA", { size: 13, fill: t.grey, spacing: 1.5 }),
    text(700, 384, "ISO 30° · SCALE 1:1", { size: 13, fill: t.grey, anchor: "end", spacing: 1.5 }),
    stack(t, 905, 292, 1),
  ].join(""));
}

function titleBlock(t) {
  const W = 1280, H = 92;
  const cells = [
    ["REV", "0.1.0"], ["LICENSE", "MIT"], ["NODE", "≥ 20.10"], ["RUNTIME DEPS", "0"], ["RENDERERS", "SVG · WebGL · 3D"], ["AGENTS", "5 supported"],
  ];
  const weights = [0.8, 0.9, 1, 1, 1.5, 1.2];
  const total = weights.reduce((a, b) => a + b, 0);
  const inner = W - 3;
  const out = [`<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" fill="${t.sheet}" stroke="${t.ink}" stroke-width="1.5"/>`];
  let x = 1.5;
  cells.forEach(([label, value], i) => {
    const w = (inner * weights[i]) / total;
    if (i) out.push(`<path d="M${r(x)} 1.5V${H - 1.5}" stroke="${t.line}" stroke-width="1"/>`);
    out.push(text(x + 22, 32, label, { size: 10.5, fill: t.grey, spacing: 1.8 }));
    out.push(text(x + 22, 66, value, { size: 23, fill: i === 0 ? t.rust : t.ink, family: SANS, weight: 500 }));
    x += w;
  });
  return svg(W, H, "Revision 0.1.0, MIT license, Node 20.10 or later, zero runtime dependencies, SVG, WebGL and 3D renderers, five supported agents.", out.join(""));
}

function arrow(t, x1, y1, x2, y2, color = t.line) {
  const a = Math.atan2(y2 - y1, x2 - x1), k = 7;
  const p1 = [x2 - k * Math.cos(a - 0.4), y2 - k * Math.sin(a - 0.4)];
  const p2 = [x2 - k * Math.cos(a + 0.4), y2 - k * Math.sin(a + 0.4)];
  return `<path d="M${r(x1)} ${r(y1)}L${r(x2)} ${r(y2)}" stroke="${color}" stroke-width="1"/><path d="M${r(p1[0])} ${r(p1[1])}L${r(x2)} ${r(y2)}L${r(p2[0])} ${r(p2[1])}Z" fill="${color}"/>`;
}

function compare(t) {
  const W = 1280, H = 420;
  const out = [sheetFrame(t, W, H, { columns: 4, rows: 2 })];
  out.push(`<path d="M640 44V376" stroke="${t.faint}" stroke-dasharray="4 5"/>`);
  out.push(text(72, 78, "FIG. A", { size: 14, fill: t.grey, spacing: 2 }));
  out.push(text(150, 78, "THE USUAL DIAGRAM", { size: 14, fill: t.ink, spacing: 2 }));
  out.push(text(704, 78, "FIG. B", { size: 14, fill: t.rust, spacing: 2 }));
  out.push(text(782, 78, "THE CUTAWAY", { size: 14, fill: t.ink, spacing: 2 }));

  const bw = 60, bh = 30, cy = 214;
  const cols = [80, 154, 228, 316, 404, 478, 552];
  const box = (x, y, label) => `<rect x="${x}" y="${y - bh / 2}" width="${bw}" height="${bh}" rx="3" fill="${t.sheet}" stroke="${t.line}"/>` + text(x + bw / 2, y + 4, label, { size: 11, fill: t.ink, anchor: "middle" });
  ["Intake", "Planner", "Router"].forEach((label, i) => out.push(box(cols[i], cy, label)));
  for (let i = 0; i < 2; i++) out.push(arrow(t, cols[i] + bw, cy, cols[i + 1] - 2, cy));
  const wy = [cy - 54, cy, cy + 54];
  ["Worker A", "Worker B", "Worker C"].forEach((label, i) => {
    out.push(box(cols[3], wy[i], label));
    out.push(arrow(t, cols[2] + bw, cy, cols[3] - 2, wy[i]));
    out.push(arrow(t, cols[3] + bw, wy[i], cols[4] - 2, cy));
  });
  ["Merge", "Review", "Output"].forEach((label, i) => out.push(box(cols[4 + i], cy, label)));
  for (let i = 4; i < 6; i++) out.push(arrow(t, cols[i] + bw, cy, cols[i + 1] - 2, cy));
  out.push(text(72, 340, "Every box looks the same. Nothing moves, nothing queues,", { size: 16, fill: t.grey, family: SANS }));
  out.push(text(72, 360, "and the numbers live in a paragraph somewhere else.", { size: 16, fill: t.grey, family: SANS }));

  out.push(stack(t, 905, 262, 0.82));
  out.push(text(704, 340, "Lift the layers, change parallelism, step a job through.", { size: 16, fill: t.ink, family: SANS }));
  out.push(text(704, 360, "Every readout comes from the model that moves the parts.", { size: 16, fill: t.grey, family: SANS }));
  return svg(W, H, "Fig. A: a flat box-and-arrow diagram of an agent pipeline. Fig. B: the same pipeline as an exploded isometric cutaway with labelled layers.", out.join(""));
}

function pipeline(t) {
  const W = 1280, H = 500;
  const steps = [
    ["Size", "figure, hero or epic"], ["Truth", "real numbers first"], ["View", "direct or metaphor"], ["Parts", "list before geometry"], ["World", "units, plans, camera"],
    ["Geometry", "built once with the kit"], ["Paint", "back to front"], ["Frame", "card, hint, readout"], ["Live", "model drives motion"], ["Verify", "audit + 4× close-ups"],
  ];
  const out = [sheetFrame(t, W, H, { columns: 5, rows: 2 })];
  out.push(text(72, 76, "THE WORKFLOW IN SKILL.md", { size: 14, fill: t.grey, spacing: 2 }));
  out.push(text(W - 72, 76, "TEN STEPS · EACH ONE GATES THE NEXT", { size: 14, fill: t.grey, anchor: "end", spacing: 2 }));
  const colW = (W - 144) / 5;
  steps.forEach(([name, sub], i) => {
    const row = Math.floor(i / 5), col = i % 5;
    const cx = 72 + colW * (col + 0.5);
    const cy = 170 + row * 200;
    const P = iso(cx, cy, 1);
    const last = i === steps.length - 1;
    out.push(slab(P, -30, -30, 0, 60, 60, 6, [t.baseTop, t.baseSide, t.baseSide], t.line));
    const h = 6 + i * 3.4;
    out.push(slab(P, -14, -14, 6, 28, 28, h, last ? [t.rustTop, t.rustL, t.rustR] : i < 2 ? [t.sage, t.sageL, t.sageR] : [t.top, t.left, t.right], t.line));
    if (last) {
      const [kx, ky] = P(0, 0, 6 + h);
      out.push(`<path d="M${r(kx - 7)} ${r(ky)}l5 4 9-8" fill="none" stroke="${t.paper}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
    out.push(text(cx - 52, cy + 58, String(i + 1).padStart(2, "0"), { size: 13, fill: t.rust, spacing: 1 }));
    out.push(text(cx - 26, cy + 58, name, { size: 17, fill: t.ink, family: SANS, weight: 600 }));
    out.push(text(cx - 52, cy + 80, sub, { size: 13, fill: t.grey }));
    if (col < 4) out.push(arrow(t, cx + 66, cy + 8, cx + colW - 66, cy + 8));
  });
  const yTurn = 170 + 112;
  const xEnd = 72 + colW * 4.5, xStart = 72 + colW * 0.5;
  out.push(`<path d="M${r(xEnd)} ${r(170 + 92)}V${yTurn}H${r(xStart - 90)}V${r(370 + 8)}H${r(xStart - 70)}" fill="none" stroke="${t.line}" stroke-width="1" stroke-dasharray="3 4"/>`);
  out.push(arrow(t, xStart - 72, 370 + 8, xStart - 66, 370 + 8));
  return svg(W, H, "The Cutaway workflow in ten steps: size, truth, view, parts, world, geometry, paint, frame, live, verify.", out.join(""));
}

function rule(t) {
  const W = 1280, H = 22, y = 11;
  const out = [`<path d="M8 ${y}H${W - 8}" stroke="${t.line}" stroke-width="1"/>`];
  out.push(`<path d="M2 ${y}l10-4v8Z M${W - 2} ${y}l-10-4v8Z" fill="${t.line}"/>`);
  for (let x = 64; x < W - 32; x += 64) out.push(`<path d="M${x} ${y - (x % 320 === 0 ? 7 : 3)}V${y + (x % 320 === 0 ? 7 : 3)}" stroke="${t.line}" stroke-width="1"/>`);
  out.push(`<rect x="${W / 2 - 5}" y="${y - 5}" width="10" height="10" fill="${t.rust}" transform="rotate(45 ${W / 2} ${y})"/>`);
  return svg(W, H, "", out.join(""));
}

function social(t) {
  const W = 1280, H = 640;
  return svg(W, H, "Cutaway. See inside the systems you build.", [
    sheetFrame(t, W, H, { columns: 6, rows: 4, rx: 0 }),
    grid(t, 700, 44, 536, 552),
    text(76, 120, "SHEET 01 / 01 &#160;·&#160; AN AGENT SKILL", { size: 15, fill: t.grey, spacing: 2.5 }),
    text(64, 280, "cutaway", { size: 160, fill: t.ink, family: SANS, weight: 600, spacing: -8 }),
    `<rect x="76" y="322" width="13" height="13" fill="${t.rust}"/>`,
    text(104, 335, "See inside the systems you build.", { size: 27, fill: t.rust }),
    text(76, 392, "Interactive isometric cutaways of software,", { size: 21, fill: t.grey, family: SANS }),
    text(76, 422, "infrastructure, AI agents and machines.", { size: 21, fill: t.grey, family: SANS }),
    `<path d="M76 520.5H640" stroke="${t.faint}"/>`,
    text(76, 556, "github.com/irishabh96/cutaway", { size: 17, fill: t.ink }),
    text(640, 556, "SVG · WEBGL · 3D", { size: 14, fill: t.grey, anchor: "end", spacing: 1.5 }),
    stack(t, 880, 420, 1.2),
  ].join(""));
}

mkdirSync(OUT, { recursive: true });
const art = { masthead, "title-block": titleBlock, compare, pipeline, rule };
for (const [name, draw] of Object.entries(art)) for (const [theme, t] of Object.entries(THEMES)) writeFileSync(`${OUT}/${name}-${theme}.svg`, draw(t));
writeFileSync(".github/assets/social-preview.svg", social(THEMES.light));
console.log(`wrote ${Object.keys(art).length * 2} files to ${OUT} and .github/assets/social-preview.svg`);
