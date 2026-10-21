// Checks for a 3D (turning groups) figure.
//
//   node scripts/turn-check.mjs <build.mjs> --fidelity [--angles 7,37,…]
//       Node only: the runtime's emitted paths against the kit's builders at P′(θ).
//   node scripts/turn-check.mjs <page.html | url> [--order] [--pops] [--lines] [--perf] …
//       Headless Chrome: paint order against a z-buffer of the recorded shapes, pops between
//       neighbouring frames, floating line ends, and frame timing.
//
// See usage() for every flag. Exit 0 when every check passed, 1 otherwise.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import { chromePort } from "./chrome-port.mjs";
import { LINE_ENDS } from "./line-ends.mjs";

function usage() {
  console.log(`Check a 3D figure built with the kit's turning groups.

  node scripts/turn-check.mjs <build.mjs> --fidelity [--angles 7,37,67]
      The build module must export T (built) and P. Prisms are compared with k.extrude and
      G.prismOf, rounds and lathes with G.lathe (and again at 10x), tubes with tubePieces, all at
      the azimuth the turn implies. A control draws one prism 2 degrees off and must fail.
      Default angles: 7, 37, 67, ... 337.

  node scripts/turn-check.mjs <page.html | url> [modes] [options]
    modes (one or more; --order when none is given):
      --order          paint order against a WebGL z-buffer of the recorded shapes (a --verify build)
      --pops           frame-to-frame jumps: first difference at +0.02 degrees, second difference over a turn
      --lines          every texture line's ends land on a stroke, at 24 angles
      --perf           240 frames at 1.1 degrees, three runs: set() time, main-thread time, writes (never fails)
    options:
      --step 1         angle step of the sweep (first turn group only; 0 < step <= 360)
      --states f.json  a JSON list of angles or value objects to visit instead of the sweep
      --fine 0.1       step of the second difference with --pops (0 < fine <= 180)
      --part name      with --order: print the part's footprint in both images for the first 12 states
      --width 1440 --height 1100 --scale N --throttle 1
                       viewport, device scale (1; 2 with --perf, 3 under 600 px) and CPU throttling
      --no-webgl       make WebGL contexts unavailable to the page (the SVG fallback)
      --out dir        with --pops: dump the first core's frames; with --perf: write the runs as JSON

Prints one line per check and ends "turn check passed" or "turn check failed: n".`);
}

// ---------------------------------------------------------------------------
// Fidelity (Node only).
async function fidelity(modulePath, rest) {
  const F = await import("./turn-fidelity.mjs");
  const at = rest.indexOf("--angles");
  const angles = at >= 0 ? String(rest[at + 1] ?? "").split(",").filter((v) => v.trim() !== "").map(Number) : Array.from({ length: 12 }, (_, i) => 7 + 30 * i);
  if (!angles.length || angles.some((v) => !Number.isFinite(v))) {
    console.error("turn-check: --angles must be a comma list of numbers");
    process.exit(1);
  }
  const { T, P } = await import(pathToFileURL(resolve(modulePath)).href);
  if (!T || !P) {
    console.error(`turn-check: ${modulePath} must export T (built with turning()) and P`);
    process.exit(1);
  }
  let failed = 0;
  const control = T.parts.find((part) => part.kind === "prism" && !part.dead && part.group && part.group.kind === "turn");
  if (control) {
    const result = F.identity(T, P, angles.slice(0, 2), { plant: control.name });
    if (result.pass) {
      console.log(`control (${control.name} drawn 2° off): did not fail: the check is broken`);
      failed++;
    } else console.log(`control (${control.name} drawn 2° off): fails as it should`);
  }
  for (const [name, run] of [["prisms", () => F.identity(T, P, angles)], ["rounds", () => F.rounds(T, P, angles)], ["tubes", () => F.tubes(T, P, angles)]]) {
    const result = run();
    console.log(result.text);
    for (const line of result.worst) console.log(`  ${line}`);
    if (!result.pass) {
      console.log(`${name} FAILED`);
      failed++;
    }
  }
  console.log(failed ? `fidelity failed: ${failed}` : "fidelity passed");
  process.exit(failed ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Options for the page checks; everything is validated before Chrome starts.
function readOptions(rest) {
  const o = { order: false, pops: false, lines: false, perf: false, step: 1, fine: 0.1, states: null, part: null, width: 1440, height: 1100, scale: null, throttle: 1, noWebgl: false, out: null };
  const value = (i, name) => {
    if (i + 1 >= rest.length) fail(`${name} needs a value`);
    return rest[i + 1];
  };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--order") o.order = true;
    else if (arg === "--pops") o.pops = true;
    else if (arg === "--lines") o.lines = true;
    else if (arg === "--perf") o.perf = true;
    else if (arg === "--no-webgl") o.noWebgl = true;
    else if (arg === "--step") o.step = Number(value(i++, arg));
    else if (arg === "--fine") o.fine = Number(value(i++, arg));
    else if (arg === "--states") o.states = value(i++, arg);
    else if (arg === "--part") o.part = value(i++, arg);
    else if (arg === "--width") o.width = Number(value(i++, arg));
    else if (arg === "--height") o.height = Number(value(i++, arg));
    else if (arg === "--scale") o.scale = Number(value(i++, arg));
    else if (arg === "--throttle") o.throttle = Number(value(i++, arg));
    else if (arg === "--out") o.out = value(i++, arg);
    else fail(`unknown argument ${arg}`);
  }
  if (!o.order && !o.pops && !o.lines && !o.perf) o.order = true;
  if (!Number.isFinite(o.step) || o.step <= 0 || o.step > 360) fail(`--step must be a finite number above 0 and at most 360 (got ${rest[rest.indexOf("--step") + 1]})`);
  if (o.pops && (!Number.isFinite(o.fine) || o.fine <= 0 || o.fine > 180)) fail(`--fine must be a finite number above 0 and at most 180 (got ${rest[rest.indexOf("--fine") + 1]})`);
  for (const [name, v] of [["--width", o.width], ["--height", o.height], ["--throttle", o.throttle]]) if (!Number.isFinite(v) || v <= 0) fail(`${name} must be a positive number`);
  if (o.scale !== null && (!Number.isFinite(o.scale) || o.scale <= 0)) fail("--scale must be a positive number");
  if (o.scale === null) o.scale = o.perf ? (o.width < 600 ? 3 : 2) : 1;
  if (o.states !== null) {
    let list;
    try {
      list = JSON.parse(readFileSync(o.states, "utf8"));
    } catch (error) {
      fail(`--states ${o.states} must be a nonempty JSON list of angles or value objects (${error.message})`);
    }
    if (!Array.isArray(list) || !list.length) fail(`--states ${o.states} must be a nonempty JSON list of angles or value objects`);
    if (list.some((s) => !(typeof s === "number" ? Number.isFinite(s) : s && typeof s === "object"))) fail(`--states ${o.states} must be a nonempty JSON list of angles or value objects`);
    o.states = list;
  }
  return o;
}

function fail(message) {
  console.error(`turn-check: ${message}`);
  process.exit(1);
}

function chromePath() {
  const found = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "/usr/bin/microsoft-edge",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Google\\Chrome\\Application\\chrome.exe") : null,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Google\\Chrome SxS\\Application\\chrome.exe") : null,
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  const caches = [
    [join(homedir(), "Library/Caches/ms-playwright"), ["chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]],
    [join(homedir(), ".cache/ms-playwright"), ["chrome-linux64/chrome", "chrome-linux/chrome"]],
    [join(homedir(), "AppData/Local/ms-playwright"), ["chrome-win64/chrome.exe", "chrome-win/chrome.exe"]],
  ];
  for (const [root, subs] of caches) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root).filter((name) => /^chrom/.test(name)).sort().reverse()) for (const sub of subs) found.push(join(root, dir, sub));
  }
  return found.find((path) => existsSync(path));
}

// ---------------------------------------------------------------------------
// A small CDP session.
async function openBrowser(o) {
  const binary = chromePath();
  if (!binary) {
    console.error("No Chrome found. Set CHROME_PATH to a Chrome or Chromium binary.");
    process.exit(1);
  }
  const profile = mkdtempSync(join(tmpdir(), "turn-check-"));
  const flags = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--allow-file-access-from-files", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
  if (process.platform === "linux") flags.push("--no-sandbox");
  if (process.platform === "win32") flags.push("--do-not-de-elevate");
  const chrome = spawn(binary, [...flags, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const port = await chromePort(chrome, profile);
  chrome.stderr.on("data", () => {});
  const close = () => {
    try {
      chrome.kill("SIGKILL");
    } catch {}
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {}
  };
  try {
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((done, failed) => {
      socket.onopen = done;
      socket.onerror = () => failed(new Error("Could not open the DevTools socket"));
    });
    const pending = new Map();
    const listeners = new Map();
    let id = 0;
    socket.onmessage = (message) => {
      const data = JSON.parse(message.data);
      if (data.id && pending.has(data.id)) {
        pending.get(data.id)(data);
        pending.delete(data.id);
      } else if (data.method) for (const listener of listeners.get(data.method) ?? []) listener(data.params);
    };
    const send = (method, params = {}, patience = 120000) =>
      new Promise((done, failed) => {
        const call = ++id;
        const timer = setTimeout(() => {
          pending.delete(call);
          failed(new Error(`Chrome did not answer ${method} within ${Math.round(patience / 1000)} s`));
        }, patience);
        pending.set(call, (data) => {
          clearTimeout(timer);
          if (data.error) failed(new Error(`${method}: ${data.error.message}`));
          else done(data.result ?? {});
        });
        socket.send(JSON.stringify({ id: call, method, params }));
      });
    const on = (method, listener) => listeners.set(method, [...(listeners.get(method) ?? []), listener]);
    const evaluate = async (expression, patience = 600000) => {
      const reply = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, patience);
      if (reply.exceptionDetails) throw new Error(`in page: ${reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text}`);
      return reply.result?.value;
    };
    return {
      send,
      on,
      evaluate,
      close: () => {
        try {
          socket.close();
        } catch {}
        close();
      },
    };
  } catch (error) {
    close();
    throw error;
  }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const NO_WEBGL = `(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...rest){if(/webgl/i.test(String(kind))&&!this.hasAttribute("data-check"))return null;return get.call(this,kind,...rest)}})();`;

async function pageChecks(target, rest) {
  const o = readOptions(rest);
  const url = /^(https?|file):/.test(target) ? target : pathToFileURL(resolve(target)).href;
  const browser = await openBrowser(o);
  let failures = 0;
  const problems = [];
  try {
    const { send, on, evaluate } = browser;
    on("Runtime.consoleAPICalled", (p) => {
      if (p.type !== "error" && p.type !== "warning") return;
      problems.push(`console.${p.type}: ${p.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 400)}`);
    });
    on("Runtime.exceptionThrown", (p) => problems.push(`exception: ${(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text ?? "").slice(0, 400)}`));
    await send("Runtime.enable");
    await send("Page.enable");
    if (o.noWebgl) await send("Page.addScriptToEvaluateOnNewDocument", { source: NO_WEBGL });
    await send("Emulation.setDeviceMetricsOverride", { width: Math.round(o.width), height: Math.round(o.height), deviceScaleFactor: o.scale, mobile: o.width < 600 });
    if (o.throttle > 1) await send("Emulation.setCPUThrottlingRate", { rate: o.throttle });
    let loaded = () => {};
    on("Page.loadEventFired", () => loaded());
    let patience = null;
    const load = new Promise((done) => {
      loaded = done;
      patience = setTimeout(done, 15000);
    });
    const nav = await send("Page.navigate", { url });
    if (nav.errorText) throw new Error(`navigation failed: ${nav.errorText}`);
    await load;
    clearTimeout(patience);
    await sleep(1500);
    await evaluate(`(${PAGE_TOOLS.toString()})()`);
    const info = await evaluate("window.__tc.info()");
    if (!info.ok) throw new Error(info.error);
    console.log(`page ${info.width}×${info.height} · live layers ${info.live.join(", ")} · theme ${info.theme}`);
    await evaluate("window.__isoTurn.set(0), true");
    const states = o.states ?? Array.from({ length: Math.max(1, Math.round(360 / o.step)) }, (_, i) => i * o.step);
    const labelOf = (state, index) => (typeof state === "number" ? `${state.toFixed(3)}°` : `state ${index}`);
    if (o.order) failures += await orderCheck(evaluate, o, states, labelOf);
    if (o.pops) failures += await popsCheck(send, evaluate, o, states, labelOf);
    if (o.lines) failures += await linesCheck(evaluate);
    if (o.perf) await perfCheck(send, evaluate, o);
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    failures++;
  } finally {
    browser.close();
  }
  if (problems.length) {
    for (const line of problems) console.log(line);
    failures += problems.length;
  } else console.log("console: clean");
  console.log(failures ? `turn check failed: ${failures}` : "turn check passed");
  return failures ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Tools installed in the page (serialised with toString, so self-contained).
function PAGE_TOOLS() {
  const stage = document.querySelector(".iso-turn") || document.querySelector(".iso-stage");
  const svgs = stage ? [...stage.children].filter((el) => el.tagName.toLowerCase() === "svg") : [];
  const box = svgs.length ? svgs[0].viewBox.baseVal : null;
  const W = box ? box.width : 0;
  const H = box ? box.height : 0;
  const S = 2;
  const STATIC_ID = 60000;
  const hex = (id) => `#${(id + 1).toString(16).padStart(6, "0")}`;
  const decode = (r, g, b) => ((r << 16) | (g << 8) | b) - 1;

  const controller = () => window.__isoTurn.controller;
  const apply = (state) => {
    if (typeof state === "number") window.__isoTurn.set(state);
    else controller().set(state);
  };

  const matrixTo = (el, root) => {
    let m = [1, 0, 0, 1, 0, 0];
    for (let node = el; node && node !== root; node = node.parentNode) {
      const list = node.transform && node.transform.baseVal;
      const item = list && list.numberOfItems ? list.consolidate() : null;
      if (!item) continue;
      const t = item.matrix;
      m = [t.a * m[0] + t.c * m[1], t.b * m[0] + t.d * m[1], t.a * m[2] + t.c * m[3], t.b * m[2] + t.d * m[3], t.a * m[4] + t.c * m[5] + t.e, t.b * m[4] + t.d * m[5] + t.f];
    }
    return m;
  };
  const fillOf = (el, colour, root) => {
    const d = el.getAttribute("d");
    if (!d) return "";
    const m = matrixTo(el, root);
    return `<path d="${d}" fill="${colour}" fill-rule="${el.getAttribute("fill-rule") || "nonzero"}" transform="matrix(${m.join(" ")})"/>`;
  };
  let board = null;
  const rasterise = (svgText, width, height) =>
    new Promise((done, failed) => {
      const image = new Image();
      const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
      image.onload = () => {
        URL.revokeObjectURL(url);
        if (!board || board.canvas.width !== width || board.canvas.height !== height) {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          board = canvas.getContext("2d", { willReadFrequently: true });
        }
        board.clearRect(0, 0, width, height);
        board.imageSmoothingEnabled = false;
        board.drawImage(image, 0, 0, width, height);
        done(board.getImageData(0, 0, width, height).data);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        failed(new Error("could not rasterise the stage"));
      };
      image.src = url;
    });

  // Painter's image: every fill, in DOM order, in an ID colour.
  const painterText = ({ reversed = false } = {}) => {
    let body = "";
    let rank = 0;
    for (const svg of svgs) {
      if (svg.hasAttribute("data-live")) {
        const parts = [...svg.querySelectorAll("[data-p]")];
        if (reversed) parts.reverse();
        for (const part of parts) {
          const id = Number(part.getAttribute("data-p"));
          for (const el of part.querySelectorAll(".iso-fill, .tb-body")) body += fillOf(el, hex(id), svg);
        }
      } else {
        const colour = hex(STATIC_ID + rank++);
        for (const el of svg.querySelectorAll(".iso-fill, .tb-body")) if (!el.closest("clipPath, defs")) body += fillOf(el, colour, svg);
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * S}" height="${H * S}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">${body}</svg>`;
  };
  const idsOf = (data) => {
    const out = new Int32Array(data.length / 4);
    for (let i = 0; i < out.length; i++) out[i] = data[4 * i + 3] < 255 ? -1 : decode(data[4 * i], data[4 * i + 1], data[4 * i + 2]);
    return out;
  };

  // The z-buffer of recorded shapes.
  let zb = null;
  const meshOf = (shape) => {
    const out = [];
    const tri = (a, b, c) => out.push(...a, ...b, ...c);
    const frame = (F) => {
      const a = F.a;
      let u = F.u;
      let v = F.v;
      if (!u || !v) {
        const helper = Math.abs(a[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
        u = [helper[1] * a[2] - helper[2] * a[1], helper[2] * a[0] - helper[0] * a[2], helper[0] * a[1] - helper[1] * a[0]];
        const l = Math.hypot(...u);
        u = u.map((x) => x / l);
        v = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
      }
      return { o: F.o, a, u, v };
    };
    const at = (F, s, x, y) => [0, 1, 2].map((c) => F.o[c] + F.a[c] * s + F.u[c] * x + F.v[c] * y);
    if (shape.kind === "prism") {
      const F = frame(shape.F);
      const n = shape.poly.length;
      const lo = shape.poly.map(([x, y]) => at(F, shape.s0, x, y));
      const hi = shape.poly.map(([x, y]) => at(F, shape.s1, x, y));
      for (let i = 1; i < n - 1; i++) {
        tri(lo[0], lo[i], lo[i + 1]);
        tri(hi[0], hi[i], hi[i + 1]);
      }
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        tri(lo[i], lo[j], hi[j]);
        tri(lo[i], hi[j], hi[i]);
      }
    } else if (shape.kind === "body") {
      const F = frame(shape.F);
      const N = 48;
      const ring = ([s, r]) => Array.from({ length: N }, (_, j) => at(F, s, r * Math.cos((j / N) * Math.PI * 2), r * Math.sin((j / N) * Math.PI * 2)));
      const rings = shape.poly.map(ring);
      for (let k = 0; k < rings.length - 1; k++)
        for (let j = 0; j < N; j++) {
          const q = (j + 1) % N;
          tri(rings[k][j], rings[k][q], rings[k + 1][q]);
          tri(rings[k][j], rings[k + 1][q], rings[k + 1][j]);
        }
    } else if (shape.kind === "ball") {
      const c = shape.o;
      const r = shape.r;
      const flats = shape.flats ?? [];
      const rows = 24;
      const cols = 48;
      const point = (i, j) => {
        const t = (i / rows) * Math.PI;
        const p = (j / cols) * Math.PI * 2;
        let q = [c[0] + r * Math.sin(t) * Math.cos(p), c[1] + r * Math.sin(t) * Math.sin(p), c[2] + r * Math.cos(t)];
        for (const [nx, ny, nz, d] of flats) {
          const over = nx * (q[0] - c[0]) + ny * (q[1] - c[1]) + nz * (q[2] - c[2]) - d;
          if (over > 0) q = [q[0] - nx * over, q[1] - ny * over, q[2] - nz * over];
        }
        return q;
      };
      for (let i = 0; i < rows; i++)
        for (let j = 0; j < cols; j++) {
          tri(point(i, j), point(i, j + 1), point(i + 1, j + 1));
          tri(point(i, j), point(i + 1, j + 1), point(i + 1, j));
        }
    } else if (shape.kind === "box") {
      const corner = (sx, sy, sz) => [0, 1, 2].map((c) => shape.o[c] + shape.axes[0][c] * sx * shape.half[0] + shape.axes[1][c] * sy * shape.half[1] + shape.axes[2][c] * sz * shape.half[2]);
      const quad = (a, b, c, d) => (tri(a, b, c), tri(a, c, d));
      const p = [-1, 1];
      for (const s of p) {
        quad(corner(s, -1, -1), corner(s, 1, -1), corner(s, 1, 1), corner(s, -1, 1));
        quad(corner(-1, s, -1), corner(1, s, -1), corner(1, s, 1), corner(-1, s, 1));
        quad(corner(-1, -1, s), corner(1, -1, s), corner(1, 1, s), corner(-1, 1, s));
      }
    } else if (shape.kind === "tube") {
      const pts = shape.points;
      const N = 12;
      const apart = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 1e-6;
      let last = [1, 0, 0];
      const rings = pts.map((p, i) => {
        let ahead = i + 1;
        while (ahead < pts.length - 1 && !apart(pts[ahead], p)) ahead++;
        let behind = i - 1;
        while (behind > 0 && !apart(pts[behind], p)) behind--;
        const a = pts[Math.min(pts.length - 1, ahead)];
        const b = pts[Math.max(0, behind)];
        let t = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
        const l = Math.hypot(...t);
        t = l > 1e-9 ? t.map((x) => x / l) : last;
        last = t;
        const F = frame({ o: p, a: t });
        const r = shape.radii ? shape.radii[i] : shape.r;
        return Array.from({ length: N }, (_, j) => at(F, 0, r * Math.cos((j / N) * Math.PI * 2), r * Math.sin((j / N) * Math.PI * 2)));
      });
      for (let k = 0; k < rings.length - 1; k++)
        for (let j = 0; j < N; j++) {
          const q = (j + 1) % N;
          tri(rings[k][j], rings[k][q], rings[k + 1][q]);
          tri(rings[k][j], rings[k + 1][q], rings[k + 1][j]);
        }
      for (const [ring, centre] of [[rings[0], pts[0]], [rings[rings.length - 1], pts[pts.length - 1]]]) for (let j = 0; j < N; j++) tri(centre, ring[j], ring[(j + 1) % N]);
    }
    return out;
  };
  const zbuffer = () => {
    if (zb) return zb;
    const verify = window.__isoVerify;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("data-check", "");
    canvas.width = W * S;
    canvas.height = H * S;
    const gl = canvas.getContext("webgl", { antialias: false, depth: true, alpha: false, preserveDrawingBuffer: true, premultipliedAlpha: false });
    if (!gl) throw new Error("the order check needs WebGL for its z-buffer");
    const compile = (type, text) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, text);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, "attribute vec3 q;uniform mat3 uR;uniform vec3 uT;uniform vec3 uM0;uniform vec3 uM1;uniform vec2 uO;uniform vec3 uV;uniform vec2 uView;uniform float uDepth;void main(){vec3 p=uR*q+uT;vec2 s=uO+vec2(dot(uM0,p),dot(uM1,p));gl_Position=vec4(s.x/uView.x*2.-1.,1.-s.y/uView.y*2.,-dot(uV,p)/uDepth,1.);}"));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, "precision highp float;uniform vec3 uId;void main(){gl_FragColor=vec4(uId,1.);}"));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const where = Object.fromEntries(["uR", "uT", "uM0", "uM1", "uO", "uV", "uView", "uDepth", "uId"].map((name) => [name, gl.getUniformLocation(program, name)]));
    const attribute = gl.getAttribLocation(program, "q");
    const items = [];
    let reach = 1;
    const add = (id, group, shapes) => {
      const verts = new Float32Array(shapes.flatMap(meshOf));
      if (!verts.length) return;
      for (let i = 0; i < verts.length; i++) reach = Math.max(reach, Math.abs(verts[i]));
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
      items.push({ id, group, buffer, count: verts.length / 3 });
    };
    verify.parts.forEach((part, index) => add(index, part.group, part.shapes));
    verify.statics.forEach((item) => add(STATIC_ID + item.rank, -1, item.shapes));
    zb = { gl, canvas, where, attribute, items, depth: reach * 4 + 100, statics: verify.statics.length };
    return zb;
  };
  const truth = () => {
    const { gl, where, attribute, items, depth } = zbuffer();
    const cams = controller().cams();
    const w = cams.world;
    gl.viewport(0, 0, W * S, H * S);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform3f(where.uM0, w.m[0], w.m[1], w.m[2]);
    gl.uniform3f(where.uM1, w.m[3], w.m[4], w.m[5]);
    gl.uniform2f(where.uO, w.ox, w.oy);
    gl.uniform3f(where.uV, w.V[0], w.V[1], w.V[2]);
    gl.uniform2f(where.uView, W, H);
    gl.uniform1f(where.uDepth, depth);
    for (const item of items) {
      const cam = item.group >= 0 ? cams[item.group] : null;
      const R = cam ? cam.R : [1, 0, 0, 0, 1, 0, 0, 0, 1];
      const t = cam ? cam.t : [0, 0, 0];
      gl.uniformMatrix3fv(where.uR, false, new Float32Array([R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]]));
      gl.uniform3f(where.uT, t[0], t[1], t[2]);
      const code = item.id + 1;
      gl.uniform3f(where.uId, ((code >> 16) & 255) / 255, ((code >> 8) & 255) / 255, (code & 255) / 255);
      gl.bindBuffer(gl.ARRAY_BUFFER, item.buffer);
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, item.count);
    }
    const data = new Uint8Array(W * S * H * S * 4);
    gl.readPixels(0, 0, W * S, H * S, gl.RGBA, gl.UNSIGNED_BYTE, data);
    const out = new Int32Array(W * S * H * S);
    for (let y = 0; y < H * S; y++)
      for (let x = 0; x < W * S; x++) {
        const at = 4 * ((H * S - 1 - y) * W * S + x);
        out[y * W * S + x] = data[at + 3] === 0 ? -1 : decode(data[at], data[at + 1], data[at + 2]);
      }
    return out;
  };
  const uniform = (ids, x, y, w, h) => {
    const v = ids[y * w + x];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (ids[(y + dy) * w + x + dx] !== v) return false;
    return true;
  };
  const tally = (paint, real, part) => {
    const w = W * S;
    const h = H * S;
    const pairs = new Map();
    let painted = 0;
    let meshed = 0;
    for (let i = 0; i < paint.length; i++) {
      if (paint[i] >= 0) painted++;
      if (real[i] >= 0) meshed++;
    }
    const foot = part === null ? null : { painter: 0, truth: 0, pbox: [Infinity, Infinity, -Infinity, -Infinity], tbox: [Infinity, Infinity, -Infinity, -Infinity] };
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const at = y * w + x;
        const p = paint[at];
        const z = real[at];
        if (foot) {
          const grow = (b) => ((b[0] = Math.min(b[0], x / S)), (b[1] = Math.min(b[1], y / S)), (b[2] = Math.max(b[2], x / S)), (b[3] = Math.max(b[3], y / S)));
          if (p === part) foot.painter++, grow(foot.pbox);
          if (z === part) foot.truth++, grow(foot.tbox);
        }
        if (p === z || p < 0 || z < 0) continue;
        if (!uniform(paint, x, y, w, h) || !uniform(real, x, y, w, h)) continue;
        const key = `${p}|${z}`;
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    return { pairs: [...pairs].map(([key, px]) => [...key.split("|").map(Number), px]), foot, painted, meshed };
  };

  // For --pops: the stage's box on the page, a state shown, and one part hidden for the control.
  const themeEl = stage ? stage.closest("[data-theme]") : null;
  const theme = themeEl && themeEl.getAttribute("data-theme") === "dark" ? "dark" : "light";

  window.__tc = {
    info() {
      if (!stage) return { ok: false, error: "no .iso-turn or .iso-stage element on the page" };
      if (!svgs.length) return { ok: false, error: "the stage has no SVG layers" };
      if (!window.__isoTurn || !window.__isoTurn.controller) return { ok: false, error: "the page has no window.__isoTurn (TURN.mount was not called)" };
      return { ok: true, width: W, height: H, live: svgs.filter((svg) => svg.hasAttribute("data-live")).map((svg) => svg.getAttribute("data-live")), theme };
    },
    hasVerify: () => Boolean(window.__isoVerify && window.__isoVerify.parts),
    orderSetup() {
      const z = zbuffer();
      return { parts: window.__isoVerify.parts.length, statics: z.statics, width: W * S, height: H * S, names: window.__isoVerify.parts.map((part) => part.name) };
    },
    async order(state, { reversed = false, part = null } = {}) {
      apply(state);
      const real = truth();
      const text = painterText({ reversed });
      const forced = controller().stats().forced || 0;
      const paint = idsOf(await rasterise(text, W * S, H * S));
      const result = tally(paint, real, part);
      return { ...result, forced };
    },
    largestLast() {
      const live = svgs.filter((svg) => svg.hasAttribute("data-live"));
      const last = live[live.length - 1];
      let best = -1;
      let area = -1;
      for (const el of last.querySelectorAll("[data-p]")) {
        const b = el.getBBox();
        if (b.width * b.height > area) (area = b.width * b.height), (best = Number(el.getAttribute("data-p")));
      }
      return best;
    },
    box() {
      const r = stage.getBoundingClientRect();
      return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height, viewWidth: W };
    },
    show(state, hide = -1) {
      apply(state);
      for (const el of stage.querySelectorAll("[data-p]")) el.style.display = Number(el.getAttribute("data-p")) === hide ? "none" : "";
      return new Promise((done) => requestAnimationFrame(() => done(true)));
    },
  };
}

// ---------------------------------------------------------------------------
async function orderCheck(evaluate, o, states, labelOf) {
  let failures = 0;
  if (!(await evaluate("window.__tc.hasVerify()"))) {
    console.log("order: this page has no window.__isoVerify; build it with --verify");
    return 1;
  }
  const setup = await evaluate("window.__tc.orderSetup()");
  const names = setup.names;
  console.log(`order: ${setup.parts} live parts and ${setup.statics} static items meshed, z-buffer ${setup.width}×${setup.height}`);
  const live = (id) => id >= 0 && id < names.length;
  const nameOf = (id) => (live(id) ? names[id] : `static layer ${id - 60000}`);
  const neighbours = (a, b) => {
    const ma = /^(.*):(\d+)$/.exec(names[a] ?? "");
    const mb = /^(.*):(\d+)$/.exec(names[b] ?? "");
    return Boolean(ma && mb && ma[1] === mb[1] && Math.abs(Number(ma[2]) - Number(mb[2])) <= 1);
  };
  const livePairs = (pairs) => pairs.filter(([p, z]) => live(p) && live(z) && !neighbours(p, z));
  let least = Infinity;
  for (const angle of [0, 90, 180, 270]) {
    const result = await evaluate(`window.__tc.order(${angle}, { reversed: true })`);
    least = Math.min(least, livePairs(result.pairs).reduce((sum, [, , px]) => sum + px, 0));
  }
  if (least >= 1000) console.log(`order control (each live layer reversed at 0, 90, 180, 270): least ${least} mismatched px · fails as it should`);
  else {
    console.log(`order control (each live layer reversed at 0, 90, 180, 270): least ${least} mismatched px · did not fail: the check is broken`);
    failures++;
  }
  const partId = o.part === null ? null : names.indexOf(o.part);
  if (o.part !== null && partId < 0) console.log(`  --part ${o.part}: no such live part`);
  let bad = 0;
  let worst = 0;
  let printed = 0;
  const staticPairs = new Map();
  for (const [index, state] of states.entries()) {
    const result = await evaluate(`window.__tc.order(${JSON.stringify(state)}, { part: ${partId !== null && partId >= 0 && index < 12 ? partId : null} })`);
    if (result.foot) {
      const f = result.foot;
      const box = (b) => (Number.isFinite(b[0]) ? b.map((v) => Math.round(v * 10) / 10) : null);
      console.log(`  ${o.part} at ${JSON.stringify(state)}: ${JSON.stringify({ painter: f.painter, truth: f.truth, painterBox: box(f.pbox), truthBox: box(f.tbox) })}`);
    }
    const errors = livePairs(result.pairs).filter(([, , px]) => px >= 4).sort((a, b) => b[2] - a[2]);
    for (const [, , px] of livePairs(result.pairs)) worst = Math.max(worst, px);
    for (const [p, z, px] of result.pairs) {
      if (live(p) === live(z) || px < 16) continue;
      const key = `${nameOf(p)} over ${nameOf(z)}`;
      staticPairs.set(key, Math.max(staticPairs.get(key) ?? 0, px));
    }
    if (errors.length) {
      bad++;
      if (printed++ < 30) console.log(`  ${labelOf(state, index)}: ${errors.slice(0, 6).map(([p, z, px]) => `${nameOf(p)} over ${nameOf(z)} ${px} px`).join(" · ")}${result.forced ? ` · forced ${result.forced}` : ""}`);
    }
  }
  console.log(`order: ${states.length} states · ${bad} with a live pair drawn out of order (4+ interior px at 2x) · worst live pair ${worst} px`);
  if (staticPairs.size) {
    const list = [...staticPairs].sort((a, b) => b[1] - a[1]).slice(0, 8);
    console.log(`  static × live (recorded static shapes are stand-ins; the layer proofs own these): ${list.map(([pair, px]) => `${pair} ${px}px`).join(" · ")}`);
  }
  return failures + bad;
}

// ---------------------------------------------------------------------------
// Pops: screenshots of the stage at 2x, as luminance, compared frame to frame.
function decodePng(buffer) {
  let at = 8;
  let width = 0;
  let height = 0;
  let type = 0;
  const data = [];
  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at);
    const kind = buffer.toString("ascii", at + 4, at + 8);
    const body = buffer.subarray(at + 8, at + 8 + length);
    if (kind === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[12] !== 0) throw new Error("turn-check: only 8-bit, non-interlaced screenshots can be read");
      type = body[9];
    } else if (kind === "IDAT") data.push(body);
    else if (kind === "IEND") break;
    at += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
  if (!channels) throw new Error(`turn-check: PNG colour type ${type} is not supported`);
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? out[y * stride + x - channels] : 0;
      const up = y ? out[(y - 1) * stride + x] : 0;
      const corner = y && x >= channels ? out[(y - 1) * stride + x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - corner);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
      }
      out[y * stride + x] = value & 255;
    }
  }
  const lum = new Float32Array(width * height);
  for (let i = 0; i < lum.length; i++) {
    const o = i * channels;
    lum[i] = channels < 3 ? out[o] : 0.2126 * out[o] + 0.7152 * out[o + 1] + 0.0722 * out[o + 2];
  }
  return { width, height, lum };
}

function encodeGray(width, height, values, gain = 1) {
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(values[y * width + x] * gain)));
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  const crc = (bytes) => {
    let c = 0xffffffff;
    for (const b of bytes) c = table[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (kind, body) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(kind, "ascii"), body]);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(typed));
    return Buffer.concat([head, typed, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function erodeMask(mask, w, h) {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mask[i] && mask[i - 1] && mask[i + 1] && mask[i - w] && mask[i + w] && mask[i - w - 1] && mask[i - w + 1] && mask[i + w - 1] && mask[i + w + 1]) out[i] = 1;
    }
  return out;
}

function regionsOf(mask, w, h, unit) {
  const seen = new Uint8Array(mask.length);
  const out = [];
  const stack = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    seen[i] = 1;
    stack.push(i);
    let n = 0;
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    while (stack.length) {
      const at = stack.pop();
      n++;
      const x = at % w;
      const y = (at - x) / w;
      b[0] = Math.min(b[0], x);
      b[1] = Math.min(b[1], y);
      b[2] = Math.max(b[2], x);
      b[3] = Math.max(b[3], y);
      for (const next of [at + 1, at - 1, at + w, at - w]) {
        if (next < 0 || next >= mask.length || Math.abs((next % w) - x) > 1) continue;
        if (mask[next] && !seen[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    out.push({ n, box: b.map((v) => Math.round((v / unit) * 10) / 10) });
  }
  return out.sort((a, b) => b.n - a.n);
}

async function popsCheck(send, evaluate, o, states, labelOf) {
  let failures = 0;
  const explicit = Boolean(o.states);
  const box = await evaluate("window.__tc.box()");
  const clip = { x: box.x, y: box.y, width: box.width, height: box.height, scale: 2 };
  const shoot = async (state, hide = -1) => {
    await evaluate(`window.__tc.show(${JSON.stringify(state)}, ${hide})`);
    const shot = await send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: true, fromSurface: true });
    if (hide >= 0) await evaluate(`window.__tc.show(${JSON.stringify(state)}, -1)`);
    return decodePng(Buffer.from(shot.data, "base64"));
  };
  const first = (A, B) => {
    const w = A.width;
    const h = A.height;
    const mask = new Uint8Array(A.lum.length);
    for (let i = 0; i < mask.length; i++) mask[i] = Math.abs(A.lum[i] - B.lum[i]) >= 5 ? 1 : 0;
    const found = regionsOf(erodeMask(erodeMask(mask, w, h), w, h), w, h, w / box.viewWidth);
    if (!found.length) return { n: 0, box: null };
    const n = found.reduce((sum, r) => sum + r.n, 0);
    const all = found.reduce((acc, r) => [Math.min(acc[0], r.box[0]), Math.min(acc[1], r.box[1]), Math.max(acc[2], r.box[2]), Math.max(acc[3], r.box[3])], [Infinity, Infinity, -Infinity, -Infinity]);
    return { n, box: all };
  };
  const hidden = await evaluate("window.__tc.largestLast()");
  const name = await evaluate(`(window.__isoTurn.controller.scene().runs[${hidden}] || {}).name || "?"`);
  const controlAt = explicit ? states[0] : 37;
  const control = first(await shoot(controlAt), await shoot(controlAt, hidden));
  if (control.n > 0) console.log(`pops control (part ${name} hidden for one frame): ${control.n} px flagged · fails as it should`);
  else {
    console.log(`pops control (part ${name} hidden for one frame): nothing flagged: the check is broken`);
    failures++;
  }
  const steps = explicit ? states.slice(0, -1).map((s, i) => [s, states[i + 1], labelOf(s, i)]) : states.map((s, i) => [s, s + 0.02, labelOf(s, i)]);
  let bad = 0;
  let previous = null;
  for (const [a, b, label] of steps) {
    const A = previous && previous.state === a ? previous.image : await shoot(a);
    const B = await shoot(b);
    previous = { state: b, image: B };
    const result = first(A, B);
    if (!result.n) continue;
    if (bad++ < 20) console.log(`  first difference ${label}: ${result.n} px survive two erosions in ${result.box.join(",")}`);
  }
  console.log(`pops, first difference: ${steps.length} steps · ${bad} with a surviving region`);
  failures += bad;
  if (!explicit) {
    const count = Math.round(360 / o.fine);
    let cores = 0;
    let small = 0;
    let printed = 0;
    const smallAt = [];
    let dumped = false;
    let A = await shoot(-o.fine);
    let B = await shoot(0);
    for (let i = 0; i < count; i++) {
      const theta = Math.round(i * o.fine * 1e6) / 1e6;
      const C = await shoot(Math.round((i + 1) * o.fine * 1e6) / 1e6);
      const w = B.width;
      const h = B.height;
      const mask = new Uint8Array(B.lum.length);
      for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
          const at = y * w + x;
          const d = Math.abs(2 * B.lum[at] - A.lum[at] - C.lum[at]);
          if (d <= 6) continue;
          if (d > 56) {
            mask[at] = 1;
            continue;
          }
          let lo = Infinity;
          let hi = -Infinity;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const v = B.lum[at + dy * w + dx];
              if (v < lo) lo = v;
              if (v > hi) hi = v;
            }
          if (hi - lo <= 4) mask[at] = 1;
        }
      const found = regionsOf(erodeMask(mask, w, h), w, h, w / box.viewWidth);
      for (const core of found) {
        if (core.n >= 6) {
          cores++;
          if (printed++ < 20) console.log(`  second difference at ${theta}°: core of ${core.n} px in ${core.box.join(",")}`);
        } else {
          small++;
          if (smallAt.length < 8 && !smallAt.includes(`${theta}°`)) smallAt.push(`${theta}°`);
        }
      }
      if (o.out && !dumped && found.some((core) => core.n >= 6)) {
        mkdirSync(o.out, { recursive: true });
        const E = new Float32Array(B.lum.length);
        for (let at = 0; at < E.length; at++) E[at] = Math.abs(2 * B.lum[at] - A.lum[at] - C.lum[at]);
        for (const [key, values, gain] of [["a", A.lum, 1], ["b", B.lum, 1], ["c", C.lum, 1], ["e", E, 8]]) writeFileSync(join(o.out, `pops-core-${key}.png`), encodeGray(w, h, values, gain));
        console.log(`  first core dumped to ${o.out}/pops-core-{a,b,c,e}.png`);
        dumped = true;
      }
      A = B;
      B = C;
    }
    console.log(`pops, second difference at ${o.fine}° over a full turn: ${cores} cores of 6+ px · ${small} small cores to read${smallAt.length ? `: ${smallAt.join(", ")}` : ""}`);
    failures += cores;
  }
  return failures;
}

async function linesCheck(evaluate) {
  let failures = 0;
  const run = `(${LINE_ENDS})({ select: null, show: false })`;
  const planted = await evaluate(`(async () => {
    window.__isoTurn.set(0);
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const part = document.querySelector("svg[data-live] [data-p]");
    if (!part) return -1;
    const svg = part.ownerSVGElement;
    const box = svg.viewBox.baseVal;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "iso-line");
    path.setAttribute("data-tone", "lo");
    path.setAttribute("data-plant", "");
    path.setAttribute("d", "M" + (box.x + 6) + " " + (box.y + 8) + "l18 4");
    part.appendChild(path);
    const result = ${run};
    path.remove();
    return result.problems.length;
  })()`);
  if (planted > 0) console.log("lines control (a planted floating line): fails as it should");
  else {
    console.log("lines control (a planted floating line): nothing flagged: the check is broken");
    failures++;
  }
  let total = 0;
  for (let i = 0; i < 24; i++) {
    const theta = i * 15;
    const result = await evaluate(`(async () => {
      window.__isoTurn.set(${theta});
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      return ${run};
    })()`);
    if (!result.problems.length) continue;
    total += result.problems.length;
    console.log(`  ${theta}°: ${result.problems.length} floating ends: ${result.problems.slice(0, 4).map((p) => `${p.what} ${p.end} ${p.gap === null || p.gap === undefined ? "∞" : p.gap.toFixed(2)} px at ${p.at.join(",")}`).join(" · ")}`);
  }
  console.log(`lines: 24 angles · ${total} floating ends`);
  return failures + total;
}

async function perfCheck(send, evaluate, o) {
  await send("Performance.enable", { timeDomain: "timeTicks" });
  const metrics = async () => Object.fromEntries((await send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
  const median = (list) => {
    const s = [...list].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };
  const p95 = (list) => {
    const s = [...list].sort((a, b) => a - b);
    return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] : 0;
  };
  const runs = [];
  for (let r = 0; r < 3; r++) {
    const before = await metrics();
    const sample = await evaluate(`new Promise((done) => {
      const c = window.__isoTurn.controller;
      const group = c.scene().groups.find((g) => g.kind === "turn");
      let value = Number(c.values[group.name]) || 0;
      const sets = [], intervals = [], writes = [], moves = [];
      let last = 0, frames = 0;
      const step = (now) => {
        if (last) intervals.push(now - last);
        last = now;
        value += 1.1;
        const t0 = performance.now();
        const stats = c.set({ [group.name]: value });
        sets.push(performance.now() - t0);
        writes.push(stats.writes);
        moves.push(stats.moved);
        if (++frames < 240) requestAnimationFrame(step);
        else done({ sets, intervals, writes, moves, elements: document.querySelectorAll("svg[data-live] *").length });
      };
      requestAnimationFrame(step);
    })`);
    const after = await metrics();
    const per = (key) => ((after[key] - before[key]) * 1000) / 240;
    runs.push({ set: median(sample.sets), setP95: p95(sample.sets), task: per("TaskDuration"), script: per("ScriptDuration"), style: per("RecalcStyleDuration"), layout: per("LayoutDuration"), interval: median(sample.intervals), intervalP95: p95(sample.intervals), elements: sample.elements, writes: median(sample.writes), moves: median(sample.moves) });
  }
  const m = (key) => median(runs.map((run) => run[key]));
  const f = (v) => v.toFixed(2);
  console.log(`perf at ${o.width} px, DPR ${o.scale}, ${o.throttle}× CPU, median of 3 runs of 240 frames at 1.1°: set() ${f(m("set"))} ms (p95 ${f(m("setP95"))}) · task ${f(m("task"))} ms · script ${f(m("script"))} ms · style ${f(m("style"))} ms · layout ${f(m("layout"))} ms per frame · frame interval ${f(m("interval"))} ms (p95 ${f(m("intervalP95"))}) · ${m("elements")} live elements · ${m("writes")} writes and ${m("moves")} moves per frame`);
  if (o.out) {
    mkdirSync(o.out, { recursive: true });
    writeFileSync(join(o.out, `perf-${o.width}-${o.throttle}x.json`), JSON.stringify(runs, null, 2));
  }
}

// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
if (!argv.length || argv.includes("--help") || argv.includes("-h")) {
  usage();
  process.exit(argv.length ? 0 : 1);
}

if (argv[0].endsWith(".mjs")) {
  await fidelity(argv[0], argv.slice(1));
} else if (typeof WebSocket === "undefined" && !process.execArgv.includes("--experimental-websocket")) {
  const child = spawn(process.execPath, ["--experimental-websocket", ...process.argv.slice(1)], { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 1));
} else {
  try {
    process.exitCode = await pageChecks(argv[0], argv.slice(1));
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  }
}
