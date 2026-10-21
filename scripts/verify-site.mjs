import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { serve } from "./serve.mjs";

const execute = promisify(execFile);
const server = serve({ port: 0, log: false });
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
const directory = mkdtempSync(join(tmpdir(), "cutaway-site-check-"));
mkdirSync("shots/site", { recursive: true });
const check = (expression, message) => ["eval", `(()=>{if(!(${expression}))throw Error(${JSON.stringify(message)});return ${JSON.stringify(message + ": passed")}})()`];
async function drive(path, actions, width = 1440) {
  const file = join(directory, "actions.json");
  writeFileSync(file, JSON.stringify(actions));
  const result = await execute(process.execPath, ["scripts/drive.mjs", base + path, "--actions", file, "--width", String(width), "--height", "1100", "--theme", "light"], { timeout: 90000, maxBuffer: 2 << 20 });
  console.log(result.stdout);
}
try {
  await drive("/", [
    ["until", "document.querySelectorAll('.gallery-card').length===10"],
    check("document.documentElement.scrollWidth <= innerWidth", "Desktop has no page overflow"),
    ["until", "document.querySelector('[data-hero-frame]').contentWindow.__cutaway"],
    check("document.querySelector('[data-hero-frame]').contentDocument.querySelector('[data-open]').getAttribute('aria-pressed') === 'true'", "Hero layers open"),
    check("document.querySelector('[data-hero-frame]').contentDocument.querySelector('[data-play]').getBoundingClientRect().bottom <= document.querySelector('[data-hero-frame]').clientHeight", "Hero controls fit in the embed"),
    ["shot", "shots/site/hero-light.png", ".hero"],
    ["click", "[data-copy]"],
    ["until", "document.querySelector('[data-toast]').textContent.includes('Copied')"],
    ["eval", "window.__cutawayOldTheme=document.documentElement.dataset.theme"],
    ["click", "[data-theme-toggle]"],
    check("document.documentElement.dataset.theme!==window.__cutawayOldTheme", "Theme switches"),
    ["scroll", ".gallery-toolbar"],
    ["click", '[data-filter="SVG + WebGL"]'],
    check("document.querySelectorAll('.gallery-card').length===2", "WebGL filter"),
    ["click", '[data-filter="3D"]'],
    check("document.querySelectorAll('.gallery-card').length===1", "3D filter"),
    ["click", '[data-filter="SVG"]'],
    check("document.querySelectorAll('.gallery-card').length===7", "SVG filter"),
    ["scroll", ".gallery-card"],
    ["click", '[data-inspect="multi-agent-orchestration"][data-tab="prompt"]'],
    check("document.querySelector('dialog').open && document.querySelector('[data-source-content]').textContent.includes('Implementation brief')", "Prompt provenance viewer"),
    ["click", '[data-source-tab="source"]'],
    ["until", "document.querySelector('[data-source-content]').textContent.includes('buildRig(')"],
    ["shot", "shots/site/source.png", "dialog"],
    ["click", '[data-source-tab="html"]'],
    ["until", "document.querySelector('[data-source-content]').textContent.includes('<!doctype html>')"],
    ["click", "[data-close-dialog]"],
    ["scroll", ".gallery-card"],
    ["until", "document.querySelector('.gallery-card img').naturalWidth > 0"],
    ["shot", "shots/site/gallery.png", ".gallery-card"],
    ["click", '[data-play-study="multi-agent-orchestration"]'],
    ["until", "document.querySelector('.study-preview iframe').contentWindow.__cutaway"],
  ]);
  await drive("/", [
    ["until", "document.querySelectorAll('.gallery-card').length===10"],
    check("document.documentElement.scrollWidth <= innerWidth", "Phone has no page overflow"),
    ["shot", "shots/site/phone.png", ".hero"],
  ], 390);
  await drive("/docs/getting-started/", [
    check("document.querySelector('h1').textContent==='Getting started'", "Markdown documentation renders"),
    check("document.querySelector('[aria-current=page]').textContent==='Getting started'", "Documentation navigation"),
    ["shot", "shots/site/docs.png", ".docs-content", 1, [0, 0, 800, 1000]],
  ]);
  await drive("/docs/playground/", [
    ["eval", "const agent=document.querySelector('[name=agent]');agent.value='codex';agent.dispatchEvent(new Event('input',{bubbles:true}))"],
    check("document.querySelector('[data-prompt-output]').textContent.startsWith('$cutaway')", "Prompt workbench uses Codex invocation"),
    ["shot", "shots/site/playground.png", ".docs-content"],
  ]);
  await drive("/showcase/caddi-pitch/", [
    check("document.querySelector('h1').textContent.includes('CADDi')", "Showcase page renders"),
    check("document.documentElement.scrollWidth <= innerWidth", "Showcase has no page overflow"),
    ["until", "document.querySelector('[data-theme-frame]').contentDocument?.querySelector('#start-btn')"],
    ["click", "[data-theme-toggle]"],
    check("document.querySelector('[data-theme-frame]').src.endsWith('caddi-pitch.html')", "Showcase frame follows the dark theme"),
    ["shot", "shots/site/showcase.png", ".showcase-stage"],
  ]);
  console.log("Cutaway · showcase interactions passed");
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}
