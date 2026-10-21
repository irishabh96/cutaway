#!/usr/bin/env node
// One-shot screenshot of a figure in headless Chrome, with optional hover, keys, zoom and timed extra shots.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { finish, openSession, pressKey, screenshot, sleep } from "./chrome.mjs";

const HELP = `capture.mjs: screenshot a figure in headless Chrome (WebGL on).

  node scripts/capture.mjs <page.html | page.svg | url> [options]

  --out <png>          where to save (capture.png); folders are created
  --width <px>         viewport width (1440)
  --height <px>        viewport height (1000)
  --scale <n>          device pixel ratio (2)
  --wait <ms>          settle time before the first shot (2500)
  --select <css>       element to clip to (the first .iso-plate, else the first svg, else the page)
  --zoom <x,y,w,h>     a region inside that element, in CSS px
  --zoom-scale <n>     pixel ratio of a zoomed shot (4)
  --hover <fx,fy>      glide the mouse to this fraction of the element first
  --key <k1,k2,…>      press keys on the focused figure first (same codes as drive.mjs; Comma for ",")
  --times <ms,…>       extra shots this long after the first, saved as name-<ms>.png
  --reduced            emulate prefers-reduced-motion: reduce
  --theme dark|light   emulate prefers-color-scheme

It prints the saved path, the clip, the readout, whether the page scrolls sideways, then the
page's console errors and exceptions (or "console: clean").`;

class UsageError extends Error {}

function numbers(text, count) {
  const parts = String(text).split(",").map((part) => (part.trim() === "" ? NaN : Number(part)));
  return parts.length === count && parts.every(Number.isFinite) ? parts : null;
}

function parseArgs(argv) {
  const options = { out: "capture.png", width: 1440, height: 1000, scale: 2, wait: 2500, zoomScale: 4, reduced: false, times: [], keys: [] };
  const take = (index, flag) => {
    const value = argv[index];
    if (value === undefined) throw new UsageError(`${flag} needs a value`);
    return value;
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--reduced") options.reduced = true;
    else if (["--width", "--height", "--scale", "--zoom-scale"].includes(arg)) {
      const value = Number(take(++index, arg));
      if (!Number.isFinite(value) || value <= 0) throw new UsageError(`${arg} needs a number above 0`);
      options[arg === "--zoom-scale" ? "zoomScale" : arg.slice(2)] = value;
    } else if (arg === "--wait") {
      const value = Number(take(++index, arg));
      if (!Number.isFinite(value) || value < 0) throw new UsageError("--wait needs a number of milliseconds, 0 or more");
      options.wait = value;
    } else if (arg === "--out") options.out = take(++index, arg);
    else if (arg === "--select") options.select = take(++index, arg);
    else if (arg === "--zoom") {
      const zoom = numbers(take(++index, arg), 4);
      if (!zoom || zoom[2] <= 0 || zoom[3] <= 0) throw new UsageError("--zoom needs x,y,w,h in CSS px, with w and h above 0");
      options.zoom = zoom;
    } else if (arg === "--hover") {
      const hover = numbers(take(++index, arg), 2);
      if (!hover) throw new UsageError("--hover needs fx,fy (fractions of the element, 0..1)");
      options.hover = hover;
    } else if (arg === "--key") options.keys = take(++index, arg).split(",").filter((key) => key !== "");
    else if (arg === "--times") {
      const times = String(take(++index, arg)).split(",").map((part) => (part.trim() === "" ? NaN : Number(part)));
      if (!times.every((time) => Number.isFinite(time) && time >= 0)) throw new UsageError("--times needs milliseconds, 0 or more, separated by commas");
      options.times = times.sort((a, b) => a - b);
    } else if (arg === "--theme") {
      const theme = take(++index, arg);
      if (theme !== "dark" && theme !== "light") throw new UsageError("--theme must be dark or light");
      options.theme = theme;
    } else if (arg.startsWith("--")) throw new UsageError(`unknown option ${arg}`);
    else if (options.target === undefined) options.target = arg;
    else throw new UsageError(`unexpected argument ${arg}`);
  }
  return options;
}

// In-page: find the clip element, centre it in the viewport and measure it in page coordinates.
const measure = (selector) => `(() => {
  const selector = ${JSON.stringify(selector ?? null)};
  let el = null;
  try { el = document.querySelector(selector ?? ".iso-plate"); } catch {}
  if (!el && selector === null) el = document.querySelector("svg") ?? document.body;
  if (!el) return null;
  el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height, x: r.left + scrollX, y: r.top + scrollY };
})()`;

const readoutOf = (selector) => `(() => {
  const text = (el) => el ? el.textContent.trim() : "";
  const selector = ${JSON.stringify(selector ?? null)};
  if (selector === null) return text(document.querySelector("[data-readout]"));
  let el = null;
  try { el = document.querySelector(selector); } catch {}
  if (!el) return "";
  const plate = el.closest(".iso-plate") ?? el.querySelector(".iso-plate") ?? el;
  return text(plate.matches("[data-readout]") ? plate : plate.querySelector("[data-readout]"));
})()`;

const focusTarget = (selector) => `(() => {
  const selector = ${JSON.stringify(selector ?? null)};
  let el = null;
  if (selector === null) el = document.querySelector('[tabindex="0"]');
  else {
    try { el = document.querySelector(selector); } catch {}
    if (el) el = el.matches('[tabindex="0"]') ? el : el.querySelector('[tabindex="0"]') ?? el.closest('[tabindex="0"]') ?? el;
  }
  if (el) el.focus();
  return Boolean(el);
})()`;

async function run(options) {
  const session = await openSession(options);
  try {
    await session.navigate(options.target);
    await sleep(Math.min(options.wait, 1500));
    await session.value(`(async () => {
      const pause = (ms) => new Promise((done) => setTimeout(done, ms));
      const height = document.documentElement.scrollHeight;
      for (let y = 400; y < height; y += 400) {
        window.scrollTo({ top: y, behavior: "instant" });
        await pause(60);
      }
      window.scrollTo({ top: 0, behavior: "instant" });
      await pause(60);
      return true;
    })()`);
    await sleep(options.wait - Math.min(options.wait, 1500));

    const locate = async () => {
      const rect = await session.value(measure(options.select));
      if (!rect) throw new Error(`Capture target not found: ${options.select}`);
      return rect;
    };

    if (options.hover) {
      await sleep(300);
      const rect = await locate();
      const from = [rect.left + 2, rect.top + 2];
      const to = [rect.left + rect.width * options.hover[0], rect.top + rect.height * options.hover[1]];
      for (let step = 0; step <= 12; step++) {
        const t = step / 12;
        await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from[0] + (to[0] - from[0]) * t, y: from[1] + (to[1] - from[1]) * t });
        await sleep(30);
      }
      await sleep(1200);
    }

    if (options.keys.length) {
      await locate();
      await session.value(focusTarget(options.select));
      let pressed = 0;
      for (const name of options.keys) {
        if (name === "Tab") continue;
        if (pressed++) await sleep(250);
        await pressKey(session, name === "Comma" ? "," : name === "Space" ? " " : name);
      }
      await sleep(1200);
    }

    const out = resolve(options.out);
    mkdirSync(dirname(out), { recursive: true });
    const shoot = async (file) => {
      const rect = await locate();
      const clip = options.zoom
        ? { x: rect.x + options.zoom[0], y: rect.y + options.zoom[1], width: options.zoom[2], height: options.zoom[3], scale: options.zoomScale / options.scale }
        : { x: rect.x - 6, y: rect.y - 6, width: rect.width + 12, height: rect.height + 12, scale: 1 };
      const png = await screenshot(session, clip);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, png);
      return rect;
    };

    let rect = await shoot(out);
    const firstShot = Date.now();
    const later = [];
    for (const delay of options.times) {
      await sleep(firstShot + delay - Date.now());
      rect = await shoot(out.replace(/\.png$/i, "") + `-${delay}.png`);
      later.push(`+${delay}ms "${await session.value(readoutOf(options.select))}"`);
    }
    const readout = await session.value(readoutOf(options.select));
    const sideways = await session.value("document.documentElement.scrollWidth > innerWidth + 1");
    console.log(`saved ${out}`);
    console.log(`clip ${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)} · readout "${readout}" · scrolls sideways: ${sideways ? "YES" : "no"}`);
    if (later.length) console.log(`readout over time: ${later.join(" · ")}`);
    console.log(session.report());
  } finally {
    await session.close();
  }
  return 0;
}

async function main() {
  const argv = process.argv.slice(2);
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`capture: ${error.message}\n`);
    return 1;
  }
  if (options.help) {
    console.log(HELP);
    return 0;
  }
  if (!options.target) {
    console.log(HELP);
    return 1;
  }
  return run(options);
}

main().then(finish, (error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  finish(1);
});
