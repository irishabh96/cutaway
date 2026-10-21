// Private helper for drive.mjs, capture.mjs and print.mjs: finds a Chrome binary and runs a
// headless DevTools session over a WebSocket. print.mjs re-exports chromePath for other scripts.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromePort } from "./chrome-port.mjs";

export const NO_CHROME = "No Chrome found. Set CHROME_PATH to a Chrome or Chromium binary.";
const PATIENCE = 60000;

function playwrightBuilds(base, tails) {
  if (!existsSync(base)) return [];
  let names;
  try {
    names = readdirSync(base).sort().reverse();
  } catch {
    return [];
  }
  return names.flatMap((name) => tails.map((tail) => join(base, name, ...tail)));
}

export function chromePath() {
  const home = homedir();
  const programs = ["C:\\Program Files", "C:\\Program Files (x86)"];
  const fixed = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    ...programs.map((root) => `${root}\\Google\\Chrome\\Application\\chrome.exe`),
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : undefined,
    ...programs.map((root) => `${root}\\Microsoft\\Edge\\Application\\msedge.exe`),
  ];
  for (const candidate of fixed) if (candidate && existsSync(candidate)) return candidate;
  const cached = [
    ...playwrightBuilds(join(home, "Library", "Caches", "ms-playwright"), [
      ["chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"],
      ["chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"],
      ["chrome-linux", "chrome"],
    ]),
    ...playwrightBuilds(join(home, ".cache", "ms-playwright"), [["chrome-linux64", "chrome"], ["chrome-linux", "chrome"]]),
    ...playwrightBuilds(join(home, "AppData", "Local", "ms-playwright"), [["chrome-win", "chrome.exe"], ["chromium-win64", "chrome.exe"]]),
  ];
  return cached.find((candidate) => existsSync(candidate));
}

export function urlOf(target) {
  return /^(https?|file):/i.test(target) ? target : pathToFileURL(resolve(target)).href;
}

export const sleep = (ms) => new Promise((done) => setTimeout(done, Math.max(0, ms)));

function describeArg(arg) {
  if ("value" in arg) return typeof arg.value === "string" ? arg.value : JSON.stringify(arg.value);
  return arg.unserializableValue ?? arg.description ?? arg.type;
}

// Starts Chrome and returns a DevTools session for one page. The caller must call close().
export async function openSession({ width = 1440, height = 1100, scale = 1, reduced = false, theme } = {}) {
  const binary = chromePath();
  if (!binary) throw new Error(NO_CHROME);
  const profile = mkdtempSync(join(tmpdir(), "cutaway-chrome-"));
  const flags = [
    "--headless=new",
    ...(process.platform === "linux" ? ["--no-sandbox"] : []),
    ...(process.platform === "win32" ? ["--do-not-de-elevate"] : []),
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--allow-file-access-from-files",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "about:blank",
  ];
  const chrome = spawn(binary, flags, { stdio: ["ignore", "ignore", "pipe"] });
  const port = await chromePort(chrome, profile);
  chrome.stderr.resume();

  let socket;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try { socket?.close(); } catch {}
    const gone = chrome.exitCode !== null || chrome.signalCode !== null
      ? Promise.resolve()
      : new Promise((done) => { chrome.once("exit", done); setTimeout(done, 3000).unref(); });
    chrome.kill("SIGKILL");
    await gone;
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
  };

  try {
    const reply = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
    const page = await reply.json();
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((done, fail) => {
      socket.onopen = done;
      socket.onerror = () => fail(new Error("Could not connect to Chrome's DevTools socket"));
    });

    const waiting = new Map();
    const listeners = new Map();
    const problems = [];
    let next = 0;
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(typeof data === "string" ? data : Buffer.from(data).toString());
      if (message.id !== undefined) {
        waiting.get(message.id)?.(message);
        return;
      }
      for (const listener of listeners.get(message.method) ?? []) listener(message.params);
    };
    socket.onclose = () => {
      for (const settle of [...waiting.values()]) settle({ error: { message: "Chrome closed the DevTools connection" } });
    };
    const on = (method, listener) => {
      if (!listeners.has(method)) listeners.set(method, new Set());
      listeners.get(method).add(listener);
      return () => listeners.get(method).delete(listener);
    };
    const send = (method, params = {}, patience = PATIENCE) => new Promise((done, fail) => {
      const id = ++next;
      const timer = setTimeout(() => {
        waiting.delete(id);
        fail(new Error(`Chrome left ${method} unanswered for ${Math.round(patience / 1000)} s`));
      }, patience);
      waiting.set(id, (message) => {
        clearTimeout(timer);
        waiting.delete(id);
        if (message.error) fail(new Error(`${method}: ${message.error.message}${message.error.data ? ` (${message.error.data})` : ""}`));
        else done(message.result);
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
    // Evaluates in the page, awaiting promises; a thrown exception or rejection becomes an Error.
    const evaluate = async (expression, patience = PATIENCE) => {
      const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, patience);
      if (result.exceptionDetails) {
        const details = result.exceptionDetails;
        const thrown = details.exception;
        const text = thrown?.description ?? (thrown && "value" in thrown ? String(thrown.value) : undefined) ?? details.text;
        throw new Error(text);
      }
      return result.result;
    };
    const value = async (expression, patience) => (await evaluate(expression, patience)).value;

    on("Runtime.consoleAPICalled", ({ type, args }) => {
      if (type !== "error" && type !== "warning") return;
      const text = args.map(describeArg).join(" ");
      problems.push(`console.${type}: ${text.length > 300 ? `${text.slice(0, 300)}…` : text}`);
    });
    on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      problems.push(`exception: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
    });

    await send("Runtime.enable");
    await send("Page.enable");
    const features = [];
    if (reduced) features.push({ name: "prefers-reduced-motion", value: "reduce" });
    if (theme) features.push({ name: "prefers-color-scheme", value: theme });
    if (features.length) await send("Emulation.setEmulatedMedia", { features });
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: width < 600 });

    const navigate = async (target) => {
      let release;
      const loaded = new Promise((done) => {
        const stop = on("Page.loadEventFired", () => { stop(); done(); });
        release = () => { stop(); done(); };
      });
      const limit = setTimeout(() => release(), 10000);
      let reply;
      try {
        reply = await send("Page.navigate", { url: urlOf(target) });
      } catch (error) {
        clearTimeout(limit);
        release();
        throw new Error(`Navigation failed: ${error.message}`);
      }
      if (reply.errorText) {
        clearTimeout(limit);
        release();
        throw new Error(`Navigation failed: ${reply.errorText}`);
      }
      await loaded;
      clearTimeout(limit);
    };

    const report = () => (problems.length ? problems.join("\n") : "console: clean");
    return { send, evaluate, value, on, navigate, close, problems, report };
  } catch (error) {
    await close();
    throw error;
  }
}

// Ends the process once everything written so far has reached stdout and stderr.
export function finish(code) {
  process.exitCode = code;
  process.stdout.write("", () => process.stderr.write("", () => process.exit(code)));
}

// Key name → { code, text, keyCode } for Input.dispatchKeyEvent.
const PUNCTUATION = {
  " ": ["Space", 32], "-": ["Minus", 189], "=": ["Equal", 187], ",": ["Comma", 188], ".": ["Period", 190],
  "/": ["Slash", 191], ";": ["Semicolon", 186], "'": ["Quote", 222], "[": ["BracketLeft", 219],
  "]": ["BracketRight", 221], "\\": ["Backslash", 220], "`": ["Backquote", 192],
};
const NAMED = {
  Enter: 13, Tab: 9, Escape: 27, Backspace: 8, Delete: 46, Insert: 45, Home: 36, End: 35, PageUp: 33, PageDown: 34,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Shift: 16, Control: 17, Alt: 18, Meta: 91,
  F1: 112, F2: 113, F3: 114, F4: 115, F5: 116, F6: 117, F7: 118, F8: 119, F9: 120, F10: 121, F11: 122, F12: 123,
};

export function keyEvent(key, code) {
  let derived = key;
  let keyCode = NAMED[key] ?? 0;
  let text;
  if (PUNCTUATION[key]) {
    [derived, keyCode] = PUNCTUATION[key];
    text = key;
  } else if (/^[0-9]$/.test(key)) {
    derived = `Digit${key}`;
    keyCode = key.charCodeAt(0);
    text = key;
  } else if ([...key].length === 1) {
    derived = `Key${key.toUpperCase()}`;
    keyCode = key.toUpperCase().charCodeAt(0);
    text = key;
  } else if (key === "Enter") {
    text = "\r";
  }
  return { key, code: code ?? derived, text, keyCode };
}

export async function pressKey(session, key, code) {
  const { text, keyCode, code: physical } = keyEvent(key, code);
  const base = { key, code: physical, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
  await session.send("Input.dispatchKeyEvent", text === undefined ? { type: "rawKeyDown", ...base } : { type: "keyDown", ...base, text, unmodifiedText: text });
  await session.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}

export async function screenshot(session, clip) {
  const { data } = await session.send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: true });
  return Buffer.from(data, "base64");
}
