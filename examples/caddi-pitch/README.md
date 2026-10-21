# CADDi live pitch

A showcase built outside the kit: an interactive, isometric pitch deck for CADDi, the AI data platform for manufacturing. One procedural CNC hydraulic valve and flange assembly (`CNC-MANIFOLD-V4`) walks through the platform's four layers. Three.js, GSAP, GLSL and the Web Audio API; no models, images or audio files.

Live: [cutaway.phasr.sh/showcase/caddi-pitch](https://cutaway.phasr.sh/showcase/caddi-pitch/) · [light](https://cutaway.phasr.sh/examples/caddi-pitch/caddi-pitch-light.html) · [dark](https://cutaway.phasr.sh/examples/caddi-pitch/caddi-pitch.html)

```bash
node examples/caddi-pitch/build.mjs
node examples/caddi-pitch/build.mjs --light
```

`build.mjs` bundles `src/` with esbuild into `caddi-pitch.js`, shared by `caddi-pitch.html` (dark) and `caddi-pitch-light.html`. The theme is the page's `data-theme`; `src/config.js` picks the matching palette for the scene, the blueprint drawing and the shaders.

| Stage | What happens | Sound |
| --- | --- | --- |
| 01. Data layer: OCR & ingest | Parts rise out of the blueprint as wireframe and point clouds, a scan plane resolves them into CAD and reads OCR tags, then the assembly explodes into its BOM | pneumatic snaps, band-passed FM sweep 300 → 1800 Hz |
| 02. Explorer: shape similarity | The flange housing splits: REV.D in clay and BREP lines against the matched part under a cost heatmap, with GD&T dimensions and the 98.4% / SAVE 34% badge | 2.5 kHz micrometer clicks, Cmaj9 FM-bell arpeggio |
| 03. Semantic data map | Threads with instanced packets run from an M6 hole, the chamfered flange, the central bore and a deep pocket to four workflow records | 1200 / 1600 Hz pings through a ping-pong delay |
| 04. Workflows & QCD ROI | The heatmap covers the assembly, the Composer / ALM card runs its QCD figures and the title block counts the ROI, then everything folds back into the drawing | confirmation bell |

Keys: `1`–`4` hold a stage, `←` `→` step, `Space` toggles auto-loop and presenter hold, `M` sound, `H` HUD. Hover a part to inspect a feature. Drag to orbit, wheel to zoom, double-click for true isometric.

| Module | Role |
| --- | --- |
| `src/main.js` | start screen, presenter control, frame loop |
| `src/timeline.js` | master timeline and sound cues; every tween is a `fromTo`, so jumps scrub both ways and the loop wraps |
| `src/soundEngine.js` | Web Audio synthesis |
| `src/cadGeometry.js` | procedural CAD and the feature table behind the heatmap and inspection |
| `src/shaders.js` | material patch (scan reveal, heatmap, clay, ghost, hatching) and the scene's shaders |
| `src/assembly.js`, `src/split.js`, `src/datamap.js` | the assembly, the Explorer split and the semantic map |
| `src/stage.js`, `src/textures.js`, `src/hud.js` | renderer and camera, the canvas blueprint, the presenter HUD |

Supplier names, costs, lot and part numbers are illustrative demo data. The platform figures (98.4%, −34%, 100,000 hours, 30%) come from the pitch brief.
