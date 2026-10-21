# Cutaway: 90-second walkthrough

Audience: developers who want to explain a system in documentation, a design review, or a launch. Tone: precise, curious, hands-on. Show real terminal commands and actual generated examples. The build section is an edited time-lapse; do not imply that a full agent build and audit completes in seconds.

| Time | Picture and interaction | Narration / on-screen copy |
| --- | --- | --- |
| 0–8s | Cold open on the orchestration rig. Open layers and step one job. | “See inside the systems you build. This is Cutaway.” |
| 8–18s | Terminal: `npx skills add irishabh96/cutaway -g -a codex`. Show the real installation result. | “Install one skill in your coding agent.” |
| 18–30s | Type `$cutaway explain an agent pipeline: planner, three workers, merge barrier, review. Let me open layers and change parallelism. Standalone HTML, both themes.` | “Name the system, the behavior, and what your reader can change.” |
| 30–43s | Edited capture of the agent writing the model, component list, and view. Add a visible “Build time-lapse” label. | “Cutaway maps the explanation to a direct architectural view or a physical mechanism.” |
| 43–55s | Show a genuine `--audit` result and 4× joint captures in both themes. Show the line-end check. | “Geometry, connections, and painting order are checked. The live readout comes from the same model as the motion.” |
| 55–68s | In the orchestration example, compare one worker with three. Step into review only after all six tasks finish. | “Explore the causal relationship. Change the pool, follow the work, inspect the barrier.” |
| 68–78s | Switch to the Raptor WebGL plume, then turn the 3D dial. Brief labels: “SVG + WebGL” and “3D beta.” | “Add shaders for continuous effects, or moving 3D parts when depth carries the explanation.” |
| 78–85s | Open the gallery prompt/source panel, toggle light/dark, then show documentation. | “Every example has a prompt and source. Learn from it, adapt it, ship the output.” |
| 85–90s | End card: `cutaway.phasr.sh`, GitHub `irishabh96/cutaway`, installation command. | “Cutaway. See inside the systems you build.” |

## Capture setup

Build first, then record the examples at an offline 60 fps sampling rate:

```sh
npm ci
npm run build
npm run record -- --example multi-agent-orchestration --theme light --seconds 8 --fps 60 --format all
npm run record -- --example raptor-engine --theme light --seconds 8 --fps 60 --format mp4
npm run record -- --example turning-dial --theme light --seconds 8 --fps 60 --format mp4
```

The default interactions are in `scripts/recordings.json`. Supply `--actions path/to/sequence.json` for a different timeline. Each entry has an `at` time in seconds and an `action` using `key`, `move`, `click`, or `eval`:

```json
[
  { "at": 0, "action": ["key", "ArrowRight"] },
  { "at": 2, "action": ["move", ".lab-stage", 0.65, 0.5] },
  { "at": 4, "action": ["key", "n"] }
]
```

Record installation and prompting separately from the generated demo footage. Use real agent output for the time-lapse and retain its actual audit result. The repository provides example clips and a reproducible recording pipeline; it does not fabricate a terminal session or an agent build.

## Delivery

Use MP4 for broad playback, WebM for an alternate web source, and animated WebP/GIF for inline previews. The video outputs retain 60 fps; preview formats reduce frame rate and dimensions to control size. Add narration captions during editing, and keep the installation command selectable in the surrounding website or README. Check the final edit with sound off, at phone width, and with readable terminal type.
