import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import * as A from "../../kit/audit.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

export function buildRig(config) {
  const theme = process.argv.includes("--light") ? "light" : "dark";
  const W = 760, H = 600;
  const deck = { x: -132, y: -62, w: 264, d: 124, r: 4 };
  const P = k.fitProjection([...k.boxCorners(deck, -16, 290)], W, H, { pad: 28, azimuth: 52, elevation: 34 });
  const R = A.recorder(P);
  const motionStates = Array.from({ length: 21 }, (_, index) => index / 20);
  const slab = (name, plan, z, h, { layer = -1, tone = "mid", label = "", node = -1 } = {}) => {
    const piece = layer < 0 ? "stand" : `layer${layer}`;
    const move = layer < 0 ? [0, 0, 0] : [0, 0, 64 * (layer + 1)];
    const centre = [plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2];
    const indicators = config.id === "multi-agent-orchestration" && node === 6;
    const text = label ? k.faceTextSvg(k.topMatrix([centre[0], indicators ? plan.y + 11 : centre[1] + 1], z + h + 0.1, P), label, { size: 7.5, tone: "hi", anchor: "middle" }) : "";
    const count = 6;
    const lights = indicators ? Array.from({ length: count }, (_, index) => {
      const columns = count / 2;
      const light = { x: plan.x + 8 + (index % columns) * (48 / columns), y: plan.y + 25 + Math.floor(index / columns) * 9, w: 4, d: 4, r: 0.4 };
      return `<path class="lab-indicator" data-task="${index}" d="${k.planOutline(light, z + h + 0.1, P, 4)}"/>`;
    }).join("") : "";
    const screws = name.includes("deck") ? k.dotsSvg(k.corners(plan, 7).map(([x, y]) => k.iso([x, y, z + h], P)), { size: 0.8 }) : "";
    const svg = k.solidSvg(k.slabOf(plan, z, h, P, 8, 0.8), { tone, inner: text + screws + lights });
    const shape = R.solid(A.slab(plan, z, h, { name, ground: name === "stand.base" }, 8));
    R.put({ name, at: centre, piece, move, shapes: [shape], svg, layer, node });
  };
  slab("stand.base", deck, -8, 8, { tone: "lo" });
  for (const x of [-116, 106]) for (const y of [-47, 37]) slab(`stand.foot.${x}.${y}`, { x, y, w: 10, d: 10, r: 2 }, -16, 8, { tone: "lo" });
  for (let layer = 0; layer < 3; layer++) {
    const z = layer * 32;
    slab(`layer${layer}.deck`, deck, z, 4, { layer, tone: "lo" });
    if (layer > 0) for (const x of [-124, 116]) for (const y of [-54, 46]) slab(`layer${layer}.post.${x}.${y}`, { x, y, w: 8, d: 8, r: 1 }, z - 28, 28, { layer, tone: "mid" });
    for (let col = 0; col < 3; col++) {
      const node = layer * 3 + col;
      const x = -108 + col * 74;
      slab(`layer${layer}.module${col}`, { x, y: -23, w: 64, d: 48, r: 3 }, z + 4, 13, { layer, node, tone: "hi", label: config.labels[node] });
      for (const side of [-1, 1]) {
        slab(`layer${layer}.port${col}.${side}`, { x: x + 12, y: side < 0 ? -29 : 25, w: 40, d: 6, r: 1 }, z + 4, 4, { layer, tone: "mid" });
      }
    }
  }
  A.settle(R, P, { states: motionStates });
  R.items.sort((a, b) => a.key - b.key);
  const geometry = R.items.map((item) => {
    const delta = k.axisVector(P, item.move);
    const lift = item.move.reduce((sum, value, index) => sum + value * R.V[index], 0);
    return `<g data-part="${item.name}" data-layer="${item.layer}" data-node="${item.node}" data-key="${item.key}" data-lift="${lift}" data-dx="${delta[0]}" data-dy="${delta[1]}">${item.svg}</g>`;
  }).join("");
  const drawing = k.figureSvg({ width: W, height: H, label: `${config.title}: three openable layers with nine components`, body: `<g data-rig>${geometry}</g>` });
  const controls = `<div class="lab-controls"><button type="button" data-open aria-pressed="false">Open layers <span>↗</span></button><button type="button" data-play aria-pressed="false">Pause</button><button type="button" data-step>Step +1s</button><button type="button" data-reset>Reset</button><label>${config.parameter.label}<input data-parameter aria-label="${config.parameter.label}" type="range" min="${config.parameter.min}" max="${config.parameter.max}" value="${config.parameter.value}"><output data-parameter-value>${config.parameter.value}</output></label></div>`;
  const nodes = `<div class="lab-nodes" role="group" aria-label="Inspect system components">${config.labels.map((label, index) => `<button type="button" data-inspect-node="${index}">${label}</button>`).join("")}</div>`;
  const body = `<header class="lab-heading"><p class="lab-kicker">${config.fig} / SVG SYSTEM STUDY</p><h1>${config.eyebrow}</h1><p>${config.description}</p></header>` + k.plateHtml({ fig: config.fig, title: config.title, hint: "Space pause · N step · ← → layers", readout: "Ready", body: `<div class="lab-stage" tabindex="0" role="group" aria-label="Interactive ${config.title}. Arrow keys open layers; space pauses; N steps.">${drawing}</div>`, caption: config.caption }) + controls + `<section class="lab-metrics" aria-label="Model measurements"><output data-metric aria-live="off"></output><output data-metric aria-live="off"></output><output data-metric aria-live="off"></output></section>${nodes}<p class="lab-inspector" data-inspector aria-live="polite">${config.details[0]}</p><p class="lab-note">Educational simulation · SVG throughout · Open the layers to inspect their components</p>`;
  const model = readFileSync(join(ROOT, config.id, "model.mjs"), "utf8").replace(/^export /gm, "");
  const live = readFileSync(join(ROOT, "shared", "live.js"), "utf8");
  const css = readFileSync(join(ROOT, "shared", "lab.css"), "utf8");
  const page = k.pageHtml({ title: config.title, theme, width: 920, body, script: `${kitScript()}\n(()=>{const CONFIG=${JSON.stringify(config)};${model}\n${live}\n})();` }).replace("</style>", css + "</style>");
  writeFileSync(join(ROOT, config.id, `${config.id}${theme === "light" ? "-light" : ""}.html`), page);
  const svgIndicators = "<style>.lab-indicator{fill:var(--cutaway-hi)}.lab-indicator[data-task]{opacity:.12}</style>";
  writeFileSync(join(ROOT, config.id, `${config.id}${theme === "light" ? "-light" : ""}.svg`), k.figureSvg({ width: W, height: H, label: config.title, body: svgIndicators + geometry, standalone: theme }));
  A.auditOrExit(R, P, { frames: motionStates, apart: true });
  console.log(`Cutaway · ${config.id} · ${theme} · ${R.solids.length} audited solids`);
}
