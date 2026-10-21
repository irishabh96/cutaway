import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import ffmpeg from "ffmpeg-static";

const execute = promisify(execFile);

test("recording fits a complete tall figure into the requested frame", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cutaway-record-framing-"));
  try {
    const page = join(directory, "fixture.html");
    await writeFile(page, '<!doctype html><style>body{margin:0}#rig{width:200px;height:1200px;background:linear-gradient(black,red)}</style><main id="rig"></main>');
    await execute(process.execPath, ["scripts/record-video.mjs", page, "--select", "#rig", "--width", "320", "--height", "240", "--fps", "60", "--seconds", "0.05", "--format", "mp4", "--out", directory], { timeout: 30000 });
    const video = join(directory, "fixture-light.mp4");
    assert.ok((await readFile(video)).length > 1000);
    const { stdout } = await execute(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", video, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { encoding: "buffer", maxBuffer: 1 << 20 });
    assert.equal(stdout.length, 320 * 240 * 3);
    const bottom = (225 * 320 + 160) * 3;
    assert.ok(stdout[bottom] > 180 && stdout[bottom + 1] < 50 && stdout[bottom + 2] < 50, "the bottom of the full red-gradient figure is visible");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
