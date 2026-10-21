#!/usr/bin/env node
// Printable sheets: captures the poses a sheet spec lists from the built light page (vector SVG, WebGL
// views as PNG), lays them out with print-sheet.mjs and prints each format to PDF with headless Chrome.
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromePath, NO_CHROME } from "./chrome.mjs";
import { FORMATS, PAPER, pagesOf, sheetHtml } from "./print-sheet.mjs";

export { chromePath };

const DRIVE = fileURLToPath(new URL("drive.mjs", import.meta.url));
const DEFAULT_LAYERS = ".iso-stage svg.iso-svg, .iso-plate svg.iso-svg";

// Runs inside the built page: freezes the current pose of every layer as markup plus part geometry.
function capturePose(config) {
  const layers = [...document.querySelectorAll(config.layers)].filter((svg) => svg.localName === "svg" && svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width > 0);
  if (!layers.length) return { __print: true, error: "no layers match " + config.layers };
  const tenth = (value) => Math.round(value * 10) / 10;
  const first = layers[0];
  const base = first.viewBox.baseVal;
  const vb = [base.x, base.y, base.width, base.height];
  const screen = first.getScreenCTM();
  const toFirst = screen.inverse();
  const k = 1 / (Math.sqrt(Math.abs(screen.a * screen.d - screen.b * screen.c)) || 1);
  const frame = document.querySelector(config.frame) || first.parentElement;
  const frameBox = frame.getBoundingClientRect();
  const origin = new DOMPoint(vb[0], vb[1]).matrixTransform(screen);
  const offset = [tenth(origin.x - frameBox.left), tenth(origin.y - frameBox.top)];

  // Box of an element in the first layer's viewBox units, or null when it has no size.
  const boxIn = (el) => {
    if (typeof el.getBBox !== "function") return null;
    let b;
    try {
      b = el.getBBox();
    } catch (error) {
      return null;
    }
    const m = el.getScreenCTM();
    if (!m || !(b.width > 0 || b.height > 0)) return null;
    const to = toFirst.multiply(m);
    const corners = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(to));
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  const union = (a, b) => (a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : b);
  const haloed = (el, stop) => {
    for (let node = el; node && node !== stop.parentNode; node = node.parentNode) {
      const name = node.getAttribute && node.getAttribute("class");
      if (name && /halo/.test(name)) return true;
    }
    return false;
  };

  const boxes = {};
  const anchors = {};
  const matched = layers.map(() => new Map());
  for (const part of config.parts) {
    let box = null;
    let best = null;
    layers.forEach((layer, index) => {
      let found;
      try {
        found = layer.querySelectorAll(part.select);
      } catch (error) {
        found = [];
      }
      for (const el of found) {
        matched[index].set(el, part.id);
        const own = boxIn(el);
        if (own && own[2] - own[0] > 0 && own[3] - own[1] > 0) box = union(box, own);
        const shapes = [el, ...el.querySelectorAll("path,circle,ellipse,rect,polygon")].filter((shape) => /^(path|circle|ellipse|rect|polygon)$/.test(shape.localName) && !haloed(shape, el));
        for (const shape of shapes) {
          const b = boxIn(shape);
          if (!b) continue;
          const area = (b[2] - b[0]) * (b[3] - b[1]);
          if (!best || area > best.area) best = { area, at: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] };
        }
      }
    });
    if (box) boxes[part.id] = box.map(tenth);
    if (best) anchors[part.id] = best.at.map(tenth);
  }

  let content = null;
  for (const layer of layers)
    for (const child of layer.children) {
      if (/^(defs|title|desc|style)$/.test(child.localName)) continue;
      const style = getComputedStyle(child);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const b = boxIn(child);
      if (b && b[2] - b[0] > 0 && b[3] - b[1] > 0) content = union(content, b);
    }

  const tones = ["hi", "mid", "lo", "dot"];
  const html = layers.map((layer, index) => {
    const clone = layer.cloneNode(true);
    const originals = [...layer.querySelectorAll("*")];
    const copies = [...clone.querySelectorAll("*")];
    originals.forEach((el, n) => {
      const id = matched[index].get(el);
      if (id === undefined) return;
      const copy = copies[n];
      const computed = getComputedStyle(el);
      const added = tones.map((tone) => {
        const current = computed.getPropertyValue("--cutaway-" + tone).trim() || "currentColor";
        return "--cutaway-" + tone + ":var(--on-" + id + "-" + tone + ",var(--part-" + tone + "," + current + "))";
      });
      const shown = el.style.display || (computed.display === "none" ? "none" : "inline");
      added.push("display:var(--show-" + id + "," + shown + ")");
      const existing = (copy.getAttribute("style") || "").trim().replace(/;+$/, "");
      copy.setAttribute("data-print-part", id);
      copy.setAttribute("style", (existing ? existing + ";" : "") + added.join(";"));
    });
    for (const selector of config.strip)
      try {
        clone.querySelectorAll(selector).forEach((el) => el.remove());
      } catch (error) {}
    clone.querySelectorAll("title,desc").forEach((el) => el.remove());
    const prefix = "ps" + index + "-";
    const ids = new Set([...clone.querySelectorAll("[id]")].map((el) => el.id));
    const rename = (value) =>
      value.replace(/url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g, (whole, quote, name) => (ids.has(name) ? "url(" + quote + "#" + prefix + name + quote + ")" : whole));
    for (const el of clone.querySelectorAll("*")) {
      for (const attribute of [...el.attributes]) {
        if (attribute.name === "id") el.setAttribute("id", prefix + attribute.value);
        else if ((attribute.name === "href" || attribute.name === "xlink:href") && attribute.value.startsWith("#") && ids.has(attribute.value.slice(1)))
          el.setAttributeNS(attribute.namespaceURI, attribute.name, "#" + prefix + attribute.value.slice(1));
        else if (attribute.value.includes("url(")) el.setAttributeNS(attribute.namespaceURI, attribute.name, rename(attribute.value));
      }
    }
    return clone.innerHTML;
  });

  const readout = document.querySelector("[data-readout]");
  return {
    __print: true,
    vb,
    k,
    offset,
    boxes,
    anchors,
    layers: html,
    content: content ? [tenth(content[0]), tenth(content[1]), tenth(content[2] - content[0]), tenth(content[3] - content[1])] : null,
    css: [...document.querySelectorAll("style")].map((style) => style.textContent).join("\n"),
    readout: readout ? readout.textContent.trim() : "",
  };
}

export function captureScript(spec) {
  const config = {
    layers: spec.layers ?? DEFAULT_LAYERS,
    strip: spec.strip ?? [],
    frame: spec.rasterSelector ?? ".iso-stage",
    parts: (spec.parts ?? []).filter((part) => part.select).map((part) => ({ id: part.id, select: part.select })),
  };
  return `(${capturePose.toString()})(${JSON.stringify(config)})`;
}

function runDrive(page, actions, { width, height, reduced }) {
  const scratch = mkdtempSync(join(tmpdir(), "cutaway-print-"));
  const actionsFile = join(scratch, "actions.json");
  const outFile = join(scratch, "stdout.txt");
  writeFileSync(actionsFile, JSON.stringify(actions));
  const out = openSync(outFile, "w");
  try {
    const args = [DRIVE, page, "--actions", actionsFile, "--width", String(width), "--height", String(height), ...(reduced ? ["--reduced"] : [])];
    const result = spawnSync(process.execPath, args, { stdio: ["ignore", out, "pipe"], maxBuffer: 64 << 20, timeout: 15 * 60000 });
    closeSync(out);
    const stdout = readFileSync(outFile, "utf8");
    if (result.status !== 0) {
      const tail = `${result.stderr ?? ""}\n${stdout}`.trim().split("\n").slice(-15).join("\n");
      throw new Error(`drive.mjs failed: ${tail || result.error?.message || `exit ${result.status}`}`);
    }
    return stdout;
  } finally {
    try { closeSync(out); } catch {}
    rmSync(scratch, { recursive: true, force: true });
  }
}

export async function capture(spec, pagePath) {
  const page = resolve(pagePath);
  const options = { reduced: spec.reduced ?? true, width: spec.width ?? 1200, height: spec.height ?? 1200 };
  const entries = Object.entries(spec.views ?? { rest: {} });
  const settle = ["wait", spec.settle ?? 1200];
  const script = captureScript(spec);
  const stdout = runDrive(page, [settle, ...entries.flatMap(([, view]) => [...(view.actions ?? []), ["eval", script], ...(view.reset ?? [])])], options);
  const results = stdout
    .split("\n")
    .filter((line) => line.startsWith("eval: "))
    .map((line) => {
      try {
        return JSON.parse(line.slice(6));
      } catch {
        return null;
      }
    })
    .filter((value) => value && value.__print);
  if (results.length !== entries.length) throw new Error(`expected ${entries.length} captures, got ${results.length}`);
  const views = {};
  let css = "";
  entries.forEach(([name, view], index) => {
    const result = results[index];
    if (result.error) throw new Error(result.error);
    css = result.css ?? css;
    views[name] = { vb: result.vb, content: result.content, layers: result.layers, boxes: result.boxes, anchors: result.anchors, k: result.k, offset: result.offset, readout: result.readout, raster: view.raster ?? null };
  });

  const rastered = entries.filter(([, view]) => view.raster);
  if (rastered.length) {
    const scratch = mkdtempSync(join(tmpdir(), "cutaway-print-raster-"));
    try {
      const shots = new Map();
      const actions = [settle];
      for (const [name, view] of entries) {
        actions.push(...(view.actions ?? []));
        if (view.raster) {
          const captured = views[name];
          const region = view.raster.region ?? captured.vb;
          const css = [
            (region[0] - captured.vb[0]) / captured.k + captured.offset[0],
            (region[1] - captured.vb[1]) / captured.k + captured.offset[1],
            region[2] / captured.k,
            region[3] / captured.k,
          ].map(Math.round);
          const file = join(scratch, `${name}.png`);
          shots.set(name, { file, region });
          actions.push(["shot", file, view.raster.selector ?? spec.rasterSelector ?? ".iso-stage", view.raster.scale ?? 2, css]);
        }
        actions.push(...(view.reset ?? []));
      }
      runDrive(page, actions, options);
      for (const [name, { file, region }] of shots) {
        if (!existsSync(file)) throw new Error(`raster shot for view "${name}" was not written`);
        views[name].raster = { region, href: `data:image/png;base64,${readFileSync(file).toString("base64")}` };
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
  return { views, css };
}

export function printPdf(htmlFile, pdfFile, { png, paper = PAPER.a4, pages = 1 } = {}) {
  const binary = chromePath();
  if (!binary) throw new Error(NO_CHROME);
  const profile = mkdtempSync(join(tmpdir(), "cutaway-pdf-"));
  const url = pathToFileURL(resolve(htmlFile)).href;
  const flags = [
    "--headless=new",
    ...(process.platform === "linux" ? ["--no-sandbox"] : []),
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--mute-audio",
    "--allow-file-access-from-files",
    `--user-data-dir=${profile}`,
  ];
  try {
    rmSync(pdfFile, { force: true });
    const pdf = spawnSync(binary, [...flags, "--no-pdf-header-footer", `--print-to-pdf=${resolve(pdfFile)}`, url], { stdio: "pipe", timeout: 120000 });
    if (!existsSync(pdfFile) || statSync(pdfFile).size === 0)
      throw new Error(`Chrome did not write ${pdfFile}: ${(pdf.stderr?.toString() ?? pdf.error?.message ?? "").trim().split("\n").slice(-5).join("\n")}`);
    if (png) {
      const shot = spawnSync(binary, [...flags, "--force-device-scale-factor=2", `--window-size=${paper.px[0]},${paper.px[1] * pages}`, `--screenshot=${resolve(png)}`, `${url}?print`], { stdio: "pipe", timeout: 120000 });
      if (!existsSync(png)) throw new Error(`Chrome did not write ${png}: ${(shot.stderr?.toString() ?? "").trim().split("\n").slice(-5).join("\n")}`);
    }
    const text = readFileSync(pdfFile).toString("latin1");
    return { pages: (text.match(/\/Type\s*\/Page(?!s)/g) ?? []).length, bytes: statSync(pdfFile).size };
  } finally {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

const HELP = `print.mjs: printable A4 or Letter sheets of a figure.

  node scripts/print.mjs <sheet.mjs> [--format poster|drawing|detailed|all] [--letter] [--png] [--out name]

  --format   poster (1 page, default), drawing (1 page), detailed (2-4 pages) or all
  --letter   US Letter instead of A4
  --png      also write a preview PNG of each sheet
  --out      base name of the outputs (default: the spec's out, else the page name)

It writes <name>-<format>-a4.html and .pdf next to the spec, and exits 1 when a format runs past its
page count. Build the light page first (node build.mjs --light). See references/print.md.`;

async function main(argv) {
  if (!argv.length) {
    console.log(HELP);
    return 1;
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    return 0;
  }
  const options = { letter: false, png: false };
  const positional = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--letter") options.letter = true;
    else if (arg === "--png") options.png = true;
    else if (arg === "--format" || arg === "--out") {
      const value = argv[++index];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value`);
      options[arg.slice(2)] = value;
    } else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else positional.push(arg);
  }
  if (positional.length !== 1) throw new Error("give exactly one sheet spec (sheet.mjs)");
  const specFile = resolve(positional[0]);
  const spec = (await import(pathToFileURL(specFile).href)).default;
  if (!spec || typeof spec !== "object") throw new Error(`${positional[0]} has no default export`);
  const here = dirname(specFile);
  if (!spec.page) throw new Error("the spec needs a page (the built light page, relative to the spec)");
  const page = resolve(here, spec.page);
  if (!existsSync(page)) throw new Error(`${page} not found; build the light page first (node build.mjs --light)`);
  const paper = options.letter ? PAPER.letter : PAPER.a4;
  const chosen = options.format ?? spec.format ?? "poster";
  if (chosen !== "all" && !FORMATS.includes(chosen)) throw new Error(`unknown format ${chosen}; use ${FORMATS.join(", ")} or all`);
  const formats = chosen === "all" ? FORMATS : [chosen];
  const base = options.out ?? spec.out ?? basename(page).replace(/(-light)?\.html$/, "");

  const captured = await capture(spec, page);
  const mainView = spec.main?.view ?? Object.keys(captured.views)[0];
  for (const part of spec.parts ?? [])
    if (part.select && !captured.views[mainView]?.boxes?.[part.id]) console.error(`warning: part ${part.id} (${part.select}) has no box in view ${mainView}`);

  let code = 0;
  for (const format of formats) {
    const name = `${base}-${format}-${options.letter ? "letter" : "a4"}`;
    const html = join(here, `${name}.html`);
    const pdf = join(here, `${name}.pdf`);
    const png = options.png ? join(here, `${name}.png`) : null;
    const expected = pagesOf(format, spec);
    writeFileSync(html, sheetHtml(captured, spec, paper, format));
    const printed = printPdf(html, pdf, { png, paper, pages: expected });
    const kb = (file) => Math.round(statSync(file).size / 1024);
    console.log(`wrote ${name}.html (${kb(html)} KB) and ${name}.pdf (${Math.round(printed.bytes / 1024)} KB, ${printed.pages} ${printed.pages === 1 ? "page" : "pages"})${png ? ` and ${name}.png` : ""}`);
    if (printed.pages !== expected) {
      console.error(`${name}: the ${format} format should print on ${expected} ${expected === 1 ? "page" : "pages"} but runs to ${printed.pages}; shorten the text`);
      code = 1;
    }
  }
  return code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(`print: ${error.message}`);
      process.exitCode = 1;
    },
  );
}
