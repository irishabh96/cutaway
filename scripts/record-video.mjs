import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { browserSession } from "./browser-session.mjs";

export const FRAME_CLOCK = `(()=>{
let now=0,id=0;const epoch=Date.now();let frames=new Map();const timers=new Map();
Object.defineProperty(performance,'now',{value:()=>now});Date.now=()=>epoch+now;
window.requestAnimationFrame=callback=>{const key=++id;frames.set(key,callback);return key};
window.cancelAnimationFrame=key=>frames.delete(key);
window.setTimeout=(callback,delay=0,...args)=>{const key=++id;timers.set(key,{callback,args,at:now+Math.max(0,Number(delay)||0),interval:0});return key};
window.setInterval=(callback,delay=0,...args)=>{const key=++id;timers.set(key,{callback,args,at:now+Math.max(1,Number(delay)||1),interval:Math.max(1,Number(delay)||1)});return key};
window.clearTimeout=window.clearInterval=key=>timers.delete(key);
window.__cutawayFrame=async time=>{now=time;let count=0;while(true){const due=[...timers].filter(([,t])=>t.at<=now).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;if(++count>10000)throw Error('Too many timers in one frame');const[key,t]=due;if(t.interval)t.at+=t.interval;else timers.delete(key);if(typeof t.callback!=='function')throw Error('String timers are unsupported');t.callback(...t.args)}const batch=frames;frames=new Map();for(const callback of batch.values())callback(now);for(const animation of document.getAnimations()){animation.pause();animation.currentTime=now}await Promise.resolve()};
})();`;

function parse(argv) {
  const options = { fps: 60, seconds: 6, width: 1280, height: 1000, theme: "light", format: "all", out: "media", all: false };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === "--all") options.all = true;
    else if (key === "--help" || key === "-h") options.help = true;
    else if (["--fps", "--seconds", "--width", "--height", "--theme", "--format", "--out", "--example", "--actions", "--select"].includes(key)) {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error(`${key} needs a value`);
      options[key.slice(2)] = ["--fps", "--seconds", "--width", "--height"].includes(key) ? Number(value) : value;
    } else if (key.startsWith("--") || options.target) throw new Error(`Unknown argument: ${key}`);
    else options.target = key;
  }
  if (options.help) return options;
  for (const key of ["fps", "width", "height"]) if (!Number.isInteger(options[key]) || options[key] < 1) throw new Error(`--${key} must be a positive integer`);
  if (options.fps > 120 || options.width > 4096 || options.height > 4096) throw new Error("Use at most 120 fps and 4096 px dimensions");
  if (options.width % 2 || options.height % 2) throw new Error("Video width and height must be even numbers");
  if (!Number.isFinite(options.seconds) || options.seconds <= 0 || options.seconds > 120) throw new Error("--seconds must be above 0 and at most 120");
  if (!["light", "dark"].includes(options.theme)) throw new Error("--theme must be light or dark");
  if (!["all", "mp4", "webm", "webp", "gif"].includes(options.format)) throw new Error("--format must be all, mp4, webm, webp, or gif");
  if ([Boolean(options.all), Boolean(options.example), Boolean(options.target)].filter(Boolean).length !== 1) throw new Error("Choose a file/URL, --example ID, or --all");
  return options;
}

async function encoder() {
  let executable = process.env.FFMPEG_PATH;
  if (!executable) { try { executable = (await import("ffmpeg-static")).default; } catch {} }
  executable ||= "ffmpeg";
  const check = spawnSync(executable, ["-version"], { encoding: "utf8" });
  if (check.error || check.status !== 0) throw new Error("FFmpeg not found. Run npm ci or set FFMPEG_PATH.");
  return executable;
}

function encoding(executable, args) {
  const process = spawn(executable, ["-hide_banner", "-loglevel", "error", "-y", ...args]);
  let stderr = "";
  process.stderr.on("data", (data) => { stderr += data; });
  const done = new Promise((resolve, reject) => {
    process.on("error", reject);
    process.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg failed (${code}): ${stderr}`)));
  });
  done.catch(() => {});
  process.stdin.on("error", () => {});
  return { process, done };
}

async function interact(browser, action) {
  const [kind, ...args] = action;
  if (kind === "eval") return browser.evaluate(args[0]);
  if (kind === "key") {
    const key = args[0];
    const selector = args[1] ?? '[tabindex="0"]';
    await browser.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Recording keyboard target missing');el.focus()})()`);
    const codes = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Escape: 27, Enter: 13, " ": 32 };
    const code = codes[key] ?? key.toUpperCase().charCodeAt(0);
    await browser.send("Input.dispatchKeyEvent", { type: "keyDown", key, windowsVirtualKeyCode: code, ...(key.length === 1 ? { text: key } : {}) });
    await browser.send("Input.dispatchKeyEvent", { type: "keyUp", key, windowsVirtualKeyCode: code });
    return;
  }
  const [selector, fx = 0.5, fy = 0.5] = args;
  const point = await browser.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector ?? ".iso-plate")});if(!el)throw Error('Recording pointer target missing');const r=el.getBoundingClientRect();return {x:r.left+r.width*${Number(fx)},y:r.top+r.height*${Number(fy)}}})()`);
  await browser.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  if (kind === "click") for (const type of ["mousePressed", "mouseReleased"]) await browser.send("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1 });
}

export async function record(options, item, executable) {
  const source = options.target ?? join("dist", "examples", item.id, `${item.id}${options.theme === "light" ? "-light" : ""}.html`);
  if (!/^(https?|file):/.test(source) && !existsSync(source)) throw new Error(`Page missing: ${source}. Run npm run build first.`);
  const timeline = options.actions ? JSON.parse(readFileSync(options.actions, "utf8")) : JSON.parse(readFileSync(new URL("./recordings.json", import.meta.url), "utf8"))[item.id] ?? [];
  if (!Array.isArray(timeline) || timeline.some((event) => !Number.isFinite(event.at) || event.at < 0 || !Array.isArray(event.action) || !["key", "move", "click", "eval"].includes(event.action[0]))) throw new Error("Actions must be an array of {at: seconds, action: [key|move|click|eval, ...]}");
  timeline.sort((a, b) => a.at - b.at);
  const out = resolve(options.out);
  mkdirSync(out, { recursive: true });
  const stem = join(out, `${item.id}-${options.theme}`);
  const browser = await browserSession({ ...options, preload: FRAME_CLOCK });
  let video;
  try {
    const url = /^(https?|file):/.test(source) ? new URL(source) : pathToFileURL(resolve(source));
    url.searchParams.set("embed", "");
    await browser.navigate(url.href);
    await browser.evaluate("document.querySelector('.iso-page')?.scrollIntoView({block:'start'})");
    const selector = options.select ?? await browser.evaluate("document.querySelector('.iso-plate') ? '.iso-plate' : 'body'");
    const background = options.theme === "light" ? "0xfbfbfa" : "0x131313";
    const fit = `scale=${options.width}:${options.height}:force_original_aspect_ratio=decrease,pad=${options.width}:${options.height}:(ow-iw)/2:(oh-ih)/2:color=${background},setsar=1`;
    video = encoding(executable, ["-f", "image2pipe", "-framerate", String(options.fps), "-i", "pipe:0", "-an", "-vf", fit, "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${stem}.mp4`]);
    const count = Math.ceil(options.seconds * options.fps);
    let eventIndex = 0;
    for (let frame = 0; frame < count; frame++) {
      const seconds = frame / options.fps;
      await browser.evaluate(`window.__cutawayFrame(${seconds * 1000})`);
      while (eventIndex < timeline.length && timeline[eventIndex].at <= seconds + 1e-9) await interact(browser, timeline[eventIndex++].action);
      const clip = await browser.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Recording capture target missing');const r=el.getBoundingClientRect();if(r.width<=0||r.height<=0)throw Error('Recording target has no area');return{x:Math.max(0,r.left+scrollX),y:Math.max(0,r.top+scrollY),width:r.width,height:r.height,scale:Math.min(1,${options.width}/r.width,${options.height}/r.height)}})()`);
      const { data } = await browser.send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: true });
      if (!video.process.stdin.write(Buffer.from(data, "base64"))) await Promise.race([once(video.process.stdin, "drain"), video.done.then(() => { throw new Error("Encoder stopped before all frames were written"); })]);
      if (frame % options.fps === 0) console.log(`Cutaway · ${item.id} · ${frame}/${count} frames`);
    }
    video.process.stdin.end();
    await video.done;
    if (browser.errors.length) throw new Error(`Page errors: ${browser.errors.join("\n")}`);
  } catch (error) { video?.process.kill(); throw error; } finally { await browser.close(); }
  const formats = options.format === "all" ? ["webm", "webp", "gif"] : options.format === "mp4" ? [] : [options.format];
  for (const format of formats) {
    const args = format === "webm" ? ["-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-row-mt", "1"] : format === "webp" ? ["-vf", "fps=15,scale=720:-1:flags=lanczos", "-loop", "0", "-c:v", "libwebp_anim", "-quality", "65"] : ["-filter_complex", "fps=12,scale=600:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse", "-loop", "0"];
    await encoding(executable, ["-i", `${stem}.mp4`, ...args, `${stem}.${format}`]).done;
  }
  console.log(`Cutaway · saved ${stem}.{mp4${formats.length ? "," + formats.join(",") : ""}} · ${options.fps} fps offline sampling`);
}

async function main() {
  const options = parse(process.argv.slice(2));
  if (options.help) return console.log("Cutaway recordings\n  node scripts/record-video.mjs --example ID | --all | page.html [--theme light|dark] [--fps 60] [--seconds 6] [--format all|mp4|webm|webp|gif] [--out media] [--actions timeline.json] [--select .iso-plate]\nCaptures the complete selected figure and fits it inside the video frame. Build the site first with npm run build. FFMPEG_PATH and CHROME_PATH override binaries.");
  const catalog = JSON.parse(readFileSync(new URL("../examples/catalog.json", import.meta.url), "utf8"));
  const selected = options.all ? catalog : options.example ? catalog.filter((item) => item.id === options.example) : [{ id: basename(options.target).replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]/gi, "-") || "recording" }];
  if (!selected.length) throw new Error(`Unknown example: ${options.example}`);
  const executable = await encoder();
  for (const item of selected) await record(options, item, executable);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(`record: ${error.message}`); process.exitCode = 1; });
