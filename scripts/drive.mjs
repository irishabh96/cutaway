#!/usr/bin/env node
// Scripted headless Chrome session: runs a list of actions against a page and reports what it saw.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { LINE_ENDS } from "./line-ends.mjs";
import { finish, openSession, pressKey, screenshot, sleep } from "./chrome.mjs";

const HELP = `drive.mjs: run a scripted session in headless Chrome (WebGL on).

  node scripts/drive.mjs <page.html | url> '<actions JSON>' [options]
  node scripts/drive.mjs <page.html | url> --actions steps.json [options]

Options
  --width <px>        viewport width (1440)
  --height <px>       viewport height (1100)
  --scale <n>         device pixel ratio (1)
  --reduced           emulate prefers-reduced-motion: reduce
  --theme dark|light  emulate prefers-color-scheme (kit pages bake their theme in at build time)
  --no-webgl          every getContext("webgl"/"webgl2"/"experimental-webgl") returns null
  --preload <file.js> run this script before the page's own scripts (e.g. window.__driveSpeed=0.04)
  --actions <file>    read the actions (a JSON array) from a file instead of the argument

Actions run in order; each is an array. A missing or null selector means the first .iso-plate
(for key, the first [tabindex="0"]); a selector that matches nothing stops the run with exit 1.
Fractions fx, fy run 0..1 across the element's box.

  ["wait", ms]                              sleep in real time
  ["scroll", sel]                           bring the element to the middle of the viewport, instantly
  ["move", sel, fx, fy]                     glide the mouse to that point (pointermove, mouseenter)
  ["click", sel, fx?, fy?]                  left click, centre by default
  ["drag", sel, fx0, fy0, fx1, fy1, steps?] press, move with the button held (20 steps), release
  ["key", key, sel?, code?]                 focus sel, then press the key ("Enter", " ", "ArrowRight", "a"…);
                                            code is derived (" " → Space, "7" → Digit7, "a" → KeyA) unless given
  ["slow", factor]                          run requestAnimationFrame time and performance.now at factor × real time
                                            (["slow", 1] restores real time; timers stay on the wall clock)
  ["until", js, timeoutMs?]                 poll until the expression (awaited) is truthy; fails after 10000 ms
  ["eval", js]                              evaluate (awaited) and print eval: <JSON>; a throw fails the run
  ["shot", out, sel?, scale?, [x,y,w,h]?]   PNG of the element plus 4 px, or of a region in its CSS px
  ["sheet", out, every, count, sel?, scale?, [x,y,w,h]?, columns?]
                                            count frames every ms apart, tiled and numbered in one PNG
  ["turn", value, group?]                   window.__isoTurn.set(value), or set({[group]: value})
  ["orbit", out, from, to, step, sel?, scale?, [x,y,w,h]?, columns?]
                                            one labelled frame per angle of the first turn group
  ["lines", out?, sel?, { tolerance }?]     line-end check; floating ends fail the run, out rings them

It prints the readout after each shot, then the page's console errors and exceptions (or "console: clean").
It runs whatever JavaScript you give it in the page.`;

const KNOWN = new Set(["wait", "scroll", "move", "click", "drag", "key", "slow", "until", "eval", "shot", "sheet", "turn", "orbit", "lines"]);
const VALUE_FLAGS = new Set(["--width", "--height", "--scale", "--theme", "--preload", "--actions"]);

function parseArgs(argv) {
  const options = { width: 1440, height: 1100, scale: 1, reduced: false, webgl: true };
  const positional = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--reduced") options.reduced = true;
    else if (arg === "--no-webgl") options.webgl = false;
    else if (VALUE_FLAGS.has(arg)) {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      if (arg === "--theme") {
        if (value !== "dark" && value !== "light") throw new Error("--theme must be dark or light");
        options.theme = value;
      } else if (arg === "--preload") options.preload = value;
      else if (arg === "--actions") options.actionsFile = value;
      else {
        const number = Number(value);
        if (!Number.isFinite(number) || number <= 0) throw new Error(`${arg} needs a number above 0`);
        options[arg.slice(2)] = number;
      }
    } else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else positional.push(arg);
  }
  [options.target, options.inline = "[]"] = positional;
  return options;
}

const finite = (value) => typeof value === "number" && Number.isFinite(value);

function validate(actions) {
  if (!Array.isArray(actions)) throw new Error("actions must be a JSON array of [name, ...args] arrays");
  for (const action of actions) {
    if (!Array.isArray(action) || !KNOWN.has(action[0])) {
      const name = Array.isArray(action) ? action[0] : JSON.stringify(action);
      throw new Error(`unknown action ${name} (known: ${[...KNOWN].join(", ")})`);
    }
    if (action[0] === "orbit") {
      const [, , from, to, step] = action;
      const ok = finite(from) && finite(to) && finite(step) && step !== 0 && (step > 0 ? from <= to : from >= to);
      if (!ok) throw new Error(`orbit needs numeric from, to and a nonzero step that moves from one to the other; got ${JSON.stringify([from, to, step])}`);
    }
    if (action[0] === "sheet") {
      const [, , every, count] = action;
      if (!(finite(every) && every >= 0 && Number.isInteger(count) && count >= 1))
        throw new Error(`sheet needs a non-negative every (ms) and a whole count of 1 or more; got ${JSON.stringify([every, count])}`);
    }
  }
}

function earlyScript() {
  window.__driveSpeed = 1;
  const speed = () => {
    const value = Number(window.__driveSpeed);
    return Number.isFinite(value) && value >= 0 ? value : 1;
  };
  const clock = (start) => {
    let real = start;
    let shown = start;
    return (now) => {
      if (now > real) {
        shown += (now - real) * speed();
        real = now;
      }
      return shown;
    };
  };
  const realNow = performance.now.bind(performance);
  const frameClock = clock(realNow());
  const nowClock = clock(realNow());
  const realFrame = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function requestAnimationFrame(callback) {
    return realFrame((stamp) => callback(frameClock(stamp)));
  };
  performance.now = function now() {
    return nowClock(realNow());
  };
}

function noWebglScript() {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(kind, ...rest) {
    if (String(kind).toLowerCase().includes("webgl")) return null;
    return original.call(this, kind, ...rest);
  };
}

// In-page: the element for a selector (null → the default), or a marker when an explicit one is missing.
const lookup = (selector, fallback) => `(() => {
  const selector = ${JSON.stringify(selector ?? null)};
  if (selector === null) return document.querySelector(${JSON.stringify(fallback)});
  try { return document.querySelector(selector); } catch { return null; }
})()`;

async function box(session, selector) {
  const found = await session.value(`(() => {
    const el = ${lookup(selector, ".iso-plate")} ?? (${JSON.stringify(selector ?? null)} === null ? document.body : null);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, x: r.left + scrollX, y: r.top + scrollY };
  })()`);
  if (!found) throw new Error(`Drive target not found: ${selector}`);
  return found;
}

async function readout(session, selector) {
  return session.value(`(() => {
    const text = (el) => el ? el.textContent.trim() : "";
    const selector = ${JSON.stringify(selector ?? null)};
    if (selector === null) return text(document.querySelector("[data-readout]"));
    let el;
    try { el = document.querySelector(selector); } catch { return ""; }
    if (!el) return "";
    if (el.matches("[data-readout]")) return text(el);
    return text(el.querySelector("[data-readout]") ?? el.closest(".iso-plate")?.querySelector("[data-readout]"));
  })()`);
}

function clipOf(rect, scale, region) {
  if (Array.isArray(region)) {
    const [x, y, w, h] = region.map(Number);
    return { x: rect.x + x, y: rect.y + y, width: w, height: h, scale };
  }
  return { x: rect.x - 4, y: rect.y - 4, width: rect.width + 8, height: rect.height + 8, scale };
}

function save(out, png) {
  const path = resolve(out);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, png);
}

const frames = (session) => session.value("new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))");

async function requireTurn(session, action) {
  const ok = await session.value(`typeof window.__isoTurn?.set === "function"`);
  if (!ok) throw new Error(`${action} action requires window.__isoTurn.set (a figure with turning groups)`);
}

// Tiles PNG frames into one sheet inside the page with a 2D canvas.
async function tile(session, pngs, labels, columns) {
  const data = await session.value(`(async () => {
    const sources = ${JSON.stringify(pngs.map((png) => `data:image/png;base64,${png.toString("base64")}`))};
    const labels = ${JSON.stringify(labels)};
    const columns = Math.min(sources.length, ${Math.max(1, Math.floor(columns))});
    const images = await Promise.all(sources.map((src) => new Promise((done, fail) => {
      const image = new Image();
      image.onload = () => done(image);
      image.onerror = () => fail(new Error("sheet: a frame did not decode"));
      image.src = src;
    })));
    const w = Math.max(...images.map((image) => image.naturalWidth));
    const h = Math.max(...images.map((image) => image.naturalHeight));
    const gap = 4;
    const rows = Math.ceil(images.length / columns);
    const canvas = document.createElement("canvas");
    canvas.width = columns * w + (columns + 1) * gap;
    canvas.height = rows * h + (rows + 1) * gap;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "bold 12px ui-monospace, Menlo, monospace";
    ctx.textBaseline = "top";
    images.forEach((image, index) => {
      const x = gap + (index % columns) * (w + gap);
      const y = gap + Math.floor(index / columns) * (h + gap);
      ctx.drawImage(image, x, y);
      ctx.fillStyle = "#ff00ff";
      ctx.fillText(labels[index], x + 4, y + 4);
    });
    return canvas.toDataURL("image/png").split(",")[1];
  })()`);
  return Buffer.from(data, "base64");
}

function problemLine(problem) {
  const gap = problem.gap === null || problem.gap === undefined || !Number.isFinite(problem.gap)
    ? "nothing nearby"
    : `${problem.gap.toFixed(2)} px from anything`;
  const pieces = [
    `  ${problem.what}  ${problem.end}${problem.mark ? " (mark, neither end rooted)" : ""}  ${gap}`,
    `at card ${problem.at.join(",")}`,
    `length ${problem.length}`,
    `d ${problem.d}…`,
  ];
  if (problem.opacity < 1) pieces.push(`opacity ${problem.opacity}`);
  return pieces.join("   ");
}

async function run(options, actions) {
  const preload = options.preload ? readFileSync(resolve(options.preload), "utf8") : "";
  const session = await openSession(options);
  let failures = 0;
  try {
    await session.send("Page.addScriptToEvaluateOnNewDocument", { source: `(${earlyScript})();` });
    if (!options.webgl) await session.send("Page.addScriptToEvaluateOnNewDocument", { source: `(${noWebglScript})();` });
    if (preload) await session.send("Page.addScriptToEvaluateOnNewDocument", { source: preload });
    await session.navigate(options.target);
    await sleep(1200);

    let mouse = [4, 4];
    const mouseEvent = (type, [x, y], extra = {}) => session.send("Input.dispatchMouseEvent", { type, x, y, ...extra });
    const pointAt = async (selector, fx = 0.5, fy = 0.5) => {
      const rect = await box(session, selector);
      return [rect.left + rect.width * Number(fx ?? 0.5), rect.top + rect.height * Number(fy ?? 0.5)];
    };
    const capture = async (out, selector, scale, region) => {
      const rect = await box(session, selector);
      return screenshot(session, clipOf(rect, Number(scale ?? 1), region));
    };

    for (const action of actions) {
      const [name, ...args] = action;
      if (name === "wait") await sleep(Number(args[0]) || 0);
      else if (name === "scroll") {
        const done = await session.value(`(() => {
          const el = ${lookup(args[0], ".iso-plate")};
          if (!el) return ${JSON.stringify(args[0] ?? null)} === null;
          el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
          return true;
        })()`);
        if (!done) throw new Error(`Drive target not found: ${args[0]}`);
      } else if (name === "move") {
        const to = await pointAt(args[0], args[1], args[2]);
        const from = mouse;
        for (let step = 1; step <= 10; step++) {
          const t = step / 10;
          await mouseEvent("mouseMoved", [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
          await sleep(16);
        }
        mouse = to;
      } else if (name === "click") {
        const at = await pointAt(args[0], args[1], args[2]);
        await mouseEvent("mouseMoved", at);
        await mouseEvent("mousePressed", at, { button: "left", buttons: 1, clickCount: 1 });
        await mouseEvent("mouseReleased", at, { button: "left", buttons: 0, clickCount: 1 });
        mouse = at;
      } else if (name === "drag") {
        const [selector, fx0, fy0, fx1, fy1, count] = args;
        const rect = await box(session, selector);
        const at = (fx, fy) => [rect.left + rect.width * Number(fx), rect.top + rect.height * Number(fy)];
        const start = at(fx0, fy0);
        const end = at(fx1, fy1);
        const steps = Math.max(1, Math.round(Number(count ?? 20)) || 1);
        await mouseEvent("mouseMoved", start);
        await mouseEvent("mousePressed", start, { button: "left", buttons: 1, clickCount: 1 });
        for (let step = 1; step <= steps; step++) {
          const t = step / steps;
          await mouseEvent("mouseMoved", [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t], { button: "left", buttons: 1 });
          await sleep(16);
        }
        await mouseEvent("mouseReleased", end, { button: "left", buttons: 0, clickCount: 1 });
        mouse = end;
      } else if (name === "key") {
        const [key, selector, code] = args;
        const focused = await session.value(`(() => {
          const el = ${lookup(selector, '[tabindex="0"]')};
          if (!el) return ${JSON.stringify(selector ?? null)} === null;
          el.focus();
          return true;
        })()`);
        if (!focused) throw new Error(`Drive target not found: ${selector}`);
        await pressKey(session, String(key), code ?? undefined);
      } else if (name === "slow") {
        await session.value(`window.__driveSpeed = ${JSON.stringify(Number(args[0]))}`);
      } else if (name === "until") {
        await until(session, String(args[0]), args[1] === undefined || args[1] === null ? 10000 : Number(args[1]));
      } else if (name === "eval") {
        const result = await session.evaluate(String(args[0]));
        const shown = "value" in result ? JSON.stringify(result.value) : result.unserializableValue ?? "undefined";
        process.stdout.write(`eval: ${shown === undefined ? "undefined" : shown}\n`);
      } else if (name === "shot") {
        const [out, selector, scale, region] = args;
        save(out, await capture(out, selector, scale, region));
        console.log(`shot ${out} · readout "${await readout(session, selector)}"`);
      } else if (name === "sheet") {
        const [out, every, count, selector, scale, region, columns] = args;
        const pngs = [];
        const readouts = [];
        for (let index = 0; index < count; index++) {
          if (index) await sleep(every);
          pngs.push(await capture(out, selector, scale ?? 0.5, region));
          readouts.push(await readout(session, selector));
        }
        save(out, await tile(session, pngs, pngs.map((_, index) => String(index)), columns ?? Math.min(count, 6)));
        console.log(`sheet ${out} · ${count} frames every ${every} ms · readouts ${readouts.map((text, index) => `${index}:"${text}"`).join(" ")}`);
      } else if (name === "turn") {
        const [value, group] = args;
        await requireTurn(session, "turn");
        const pose = group !== undefined && group !== null ? { [group]: value } : value !== null && typeof value === "object" ? value : Number(value);
        await session.value(`(window.__isoTurn.set(${JSON.stringify(pose)}), true)`);
        await frames(session);
      } else if (name === "orbit") {
        const [out, from, to, step, selector, scale, region, columns] = args;
        await requireTurn(session, "orbit");
        const count = Math.floor((to - from) / step + 1e-9) + 1;
        const pngs = [];
        const labels = [];
        for (let index = 0; index < count; index++) {
          const angle = Math.round((from + index * step) * 1000) / 1000;
          await session.value(`(window.__isoTurn.set(${angle}), true)`);
          await frames(session);
          pngs.push(await capture(out, selector, scale ?? 0.5, region));
          labels.push(`${angle}°`);
        }
        save(out, await tile(session, pngs, labels, columns ?? 6));
        console.log(`orbit ${out} · ${count} frames ${from}°…${to}° every ${step}°`);
      } else if (name === "lines") {
        const [out, selector, extra] = args;
        const settings = { select: selector ?? null, show: Boolean(out), ...(extra && typeof extra === "object" ? extra : {}) };
        const result = await session.value(`(${LINE_ENDS})(${JSON.stringify(settings)})`);
        if (!result) {
          console.log("line ends: the check did not run");
          failures++;
        } else {
          console.log(`line ends: ${result.problems.length} of ${result.ends} ends on ${result.lines} lines float`);
          for (const problem of result.problems) console.log(problemLine(problem));
          failures += result.problems.length;
        }
        if (out) {
          save(out, await capture(out, selector, 2));
          await session.value(`(document.querySelectorAll("[data-line-ends]").forEach((el) => el.remove()), true)`);
          console.log(`shot ${out}`);
        }
      }
    }
    console.log(session.report());
  } finally {
    await session.close();
  }
  return failures ? 1 : 0;
}

// Polls a condition; every evaluation races it against an in-page timer for the time that is left.
async function until(session, js, timeout) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const left = Math.max(0, deadline - Date.now());
    const verdict = await session.value(`(() => {
      const late = {};
      const condition = new Promise((done, fail) => {
        try { done((0, eval)(${JSON.stringify(js)})); } catch (error) { fail(error); }
      });
      const timer = new Promise((done) => setTimeout(() => done(late), ${left}));
      return Promise.race([condition, timer]).then((value) => value === late ? "late" : Boolean(value));
    })()`, left + 60000);
    if (verdict === true) return;
    if (verdict === "late" || Date.now() >= deadline) throw new Error(`until: timed out after ${timeout} ms waiting for ${js}`);
    await sleep(25);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length) {
    console.log(HELP);
    return 1;
  }
  const options = parseArgs(argv);
  if (options.help) {
    console.log(HELP);
    return 0;
  }
  if (!options.target) {
    console.log(HELP);
    return 1;
  }
  const source = options.actionsFile ? readFileSync(resolve(options.actionsFile), "utf8") : options.inline;
  let actions;
  try {
    actions = JSON.parse(source);
  } catch (error) {
    throw new Error(`actions are not valid JSON: ${error.message}`);
  }
  validate(actions);
  return run(options, actions);
}

main().then(finish, (error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  finish(1);
});
