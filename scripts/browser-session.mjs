import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromePath } from "./print.mjs";
import { chromePort } from "./chrome-port.mjs";

export async function browserSession({ width = 1280, height = 1000, preload = "", theme = "light" } = {}) {
  const binary = chromePath();
  if (!binary) throw new Error("Chrome not found. Set CHROME_PATH to a Chrome or Chromium executable.");
  const profile = mkdtempSync(join(tmpdir(), "cutaway-record-"));
  const chrome = spawn(binary, ["--headless=new", ...(process.platform === "linux" ? ["--no-sandbox"] : []), ...(process.platform === "win32" ? ["--do-not-de-elevate"] : []), "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--allow-file-access-from-files", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "about:blank"]);
  let socket;
  let requestClose;
  const close = async () => {
    const exited = !chrome.pid || chrome.exitCode !== null || chrome.signalCode !== null ? Promise.resolve() : new Promise((resolve) => chrome.once("exit", resolve));
    const fallback = setTimeout(() => chrome.kill("SIGKILL"), 2000);
    if (requestClose && socket?.readyState === WebSocket.OPEN) requestClose().catch(() => chrome.kill("SIGKILL"));
    else chrome.kill("SIGKILL");
    try { await exited; } finally { clearTimeout(fallback); }
    socket?.close();
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  };
  try {
    const port = await chromePort(chrome, profile);
    const page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let id = 0;
    let loaded = () => {};
    const pending = new Map();
    const errors = [];
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) pending.get(message.id)?.(message);
      if (message.method === "Page.loadEventFired") loaded();
      if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
      if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") errors.push(message.params.args.map((value) => value.value ?? value.description).join(" "));
    };
    socket.onclose = () => { for (const done of pending.values()) done({ error: { message: "Chrome disconnected" } }); };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const call = ++id;
      const timer = setTimeout(() => { pending.delete(call); reject(new Error(`Chrome timed out: ${method}`)); }, 30000);
      pending.set(call, (message) => {
        clearTimeout(timer);
        pending.delete(call);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      });
      socket.send(JSON.stringify({ id: call, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result?.value;
    };
    requestClose = () => send("Browser.close");
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }, { name: "prefers-reduced-motion", value: "no-preference" }] });
    if (preload) await send("Page.addScriptToEvaluateOnNewDocument", { source: preload });
    const navigate = async (url) => {
      let timer;
      const ready = new Promise((resolve, reject) => { loaded = resolve; timer = setTimeout(() => reject(new Error("Page did not finish loading")), 15000); });
      const result = await send("Page.navigate", { url });
      if (result.errorText) { clearTimeout(timer); throw new Error(`Navigation failed: ${result.errorText}`); }
      try { await ready; } finally { clearTimeout(timer); }
    };
    return { send, evaluate, navigate, close, errors };
  } catch (error) { await close(); throw error; }
}
