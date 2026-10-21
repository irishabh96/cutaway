# Architecture and kit

Cutaway is an agent skill plus a rendering kit and local tools. The core has no runtime package dependencies. Standalone examples inline their geometry, CSS, model, and behavior into HTML. The showcase is a static build; React, Markdown parsing, and video encoding are development tools.

## Repository map

| Location | Responsibility |
| --- | --- |
| `SKILL.md`, `agents/` | Skill discovery, invocation, design workflow, agent metadata |
| `kit/iso-kit.ts`, `kit/iso-kit.mjs`, `kit/iso.css` | Camera, geometry, shading, SVG strings, frames, styles |
| `kit/lathe.mjs`, `kit/tube.mjs`, `kit/audit.mjs` | Curved solids, routes, physical clearance and depth audits |
| `kit/gl.mjs` | WebGL layers registered to the isometric camera |
| `kit/turn*.mjs` | Beta moving 3D builder, runtime, and orbit audit |
| `kit/react/` | Server-safe drawing components and client interaction hooks |
| `examples/` | Buildable figures, pure models, source, committed standalone pages |
| `scripts/` | Builds, browser checks, recordings, print export, optional gallery publishing |
| `references/` | Detailed agent-facing APIs and craft rules |
| `docs/`, `site/` | Human documentation and the static showcase source |

Experimental `turn-fixed.mjs`, `canvas-painter.mjs`, and `gl-shared.mjs` are retained but are not the default renderer.

## The camera

World coordinates are `[x, y, z]`: x/y on the floor, z upward. Default azimuth is 45°, elevation 30°. With azimuth `a`, elevation `e`, scale `k = scale × sqrt(1.6)`, and SVG origin `[ox, oy]`:

```text
sx = ox + (x sin(a) - y cos(a)) k
sy = oy + ((x cos(a) + y sin(a)) sin(e) - z cos(e)) k
depth = (x cos(a) + y sin(a)) cos(e) + z sin(e)
```

`iso(point, P)` projects a point. `fitProjection(extremePoints, width, height, options)` fits the object to its viewBox. `depthOf(point, P)` increases toward the viewer: paint smaller depth first. `axisVector(P, displacement)` projects a world displacement for transforms. WebGL uses the same camera contract through `glCamera` and `GLSL_ISO`.

## Geometry and painting

Start with `slabOf`, `cylinder`, or `extrude`; use `lathe` for round profiles and `tubePieces` for routed pipes. The core produces filled regions, four side tones, a lighter top, and outlines. Let `solidSvg` or React's `Solid` paint them in the intended order. The palette uses `--cutaway-*` tokens with separate light and dark values.

Center-depth sorting is useful for simple isolated parts. For overlapping solids, record actual shapes and let the audit solve the order from their visible overlaps. Split a component if it cannot be painted as one ordered item.

```js
import * as k from '../kit/iso-kit.mjs';
import * as A from '../kit/audit.mjs';

const plan = { x: -30, y: -20, w: 60, d: 40, r: 3 };
const P = k.fitProjection(k.boxCorners(plan, 0, 8), 600, 380);
const R = A.recorder(P);
const shape = R.solid(A.slab(plan, 0, 8, { name: 'stand.base', ground: true }));
R.put({ name: 'base', at: [0, 0, 4], shapes: [shape], svg: k.solidSvg(k.slabOf(plan, 0, 8, P)) });
A.settle(R, P);
A.auditOrExit(R, P);
```

The `ground` flag identifies a genuine supporting base. It must not be used to hide unsupported components. `references/kit.md` contains complete signatures and shape recipes.

## Craft and verification

Architectural cutaways may label real components and open bounded layers. Physical metaphors may use rails, drawers, dials, and mechanisms. Both need legible responsibilities and truthful behavior. Decorative complexity is not a substitute for a correct system.

- Route pipes from real ports, along structure, with clearance. No intersections at rest, apart, or in between.
- Record the shape actually drawn. Correct the geometry when the audit reports an interlock.
- End seams and textures on an edge or fade them out. Check line markup separately from geometry.
- Keep rounded profiles smooth, contacts flush, and joints physically plausible.
- Use one pure model for simulation, motion, captions, and live numbers.
- Support keyboard input, reduced motion, phone widths, both themes, and offscreen suspension.

```sh
node examples/multi-agent-orchestration/build.mjs --light --audit
node scripts/lines.mjs examples/multi-agent-orchestration/multi-agent-orchestration-light.html --out shots/lines.png
node scripts/capture.mjs examples/multi-agent-orchestration/multi-agent-orchestration-light.html --width 390 --out shots/phone.png
node scripts/drive.mjs examples/multi-agent-orchestration/multi-agent-orchestration-light.html '[["key","ArrowRight"],["wait",1200],["shot","shots/open.png"]]'
```

Inspect the PNGs, including 4× joint crops. A passing geometry audit does not prove text legibility or correct simulation semantics. For moving 3D, use the complete orbit audit and fidelity/order/line checks in `references/3d.md`.

## Export targets

### Standalone SVG

```js
const svg = k.figureSvg({ width: 600, height: 380, label: 'My system', body: art, standalone: 'light' });
```

Styles are embedded. This is a still, suitable for documentation or further editing. The two software flagship builders export SVG alongside HTML in both themes.

### Standalone HTML

Build the SVG with `figureSvg`, wrap it with `plateHtml`, and call `pageHtml`. Inline `kitScript()` and your model/interaction code. Add `glScript()` or `turnScript()` only when used. The result opens without a server. Add `?embed` when embedding a kit page in the showcase.

### React and Next.js

Copy `kit/` into your app. Compute static geometry in plain TypeScript; render it with server-safe `kit/react/draw.tsx`. Put event handlers and animation hooks from `kit/react/live.tsx` in one client boundary. Give streamed element props stable keys. Import `iso.css` once and set `className="iso"` and `data-theme` on the wrapper. See `examples/test-rig`, `examples/spot-plate`, and `references/react.md`.

## Extend a primitive

Add a geometry helper in `iso-kit.ts` or a focused ESM module. Preserve existing defaults. Add an audit representation for any new physical shape, update `references/kit.md`, then run `npm run build:kit` if the TypeScript core changed. That regenerates `iso-kit.mjs` and `iso.css`. Rebuild both themes and inspect the affected examples. Add a regression test when a geometric or behavioral invariant warrants one.

## Website and deployment

`npm run build:site` renders Markdown at build time, bundles the two React previews, and copies standalone figures into `dist/`. Gallery and docs JavaScript are framework-free. Assets use relative URLs so the build also works under a GitHub Pages repository prefix. Deploy `dist/` on GitHub Pages, Vercel, or Cloudflare Pages. GitHub deployment requires Pages to use GitHub Actions; custom DNS must point the supplied domain to the selected host.

## Record motion

```sh
npm run record -- --example multi-agent-orchestration --theme light --fps 60 --seconds 6 --format all
npm run record:all -- --seconds 4 --fps 60
```

The recorder advances an explicit frame clock and sends scheduled pointer/keyboard actions through Chrome, then encodes MP4, WebM, animated WebP, and GIF with FFmpeg. It captures the complete `.iso-plate` and fits it inside the video frame; use `--select` for another target. Frames are sampled at the requested simulation rate, independent of how slowly Chrome captures them. This is an offline recording workflow, not a benchmark of real-time browser performance. See `docs/video-walkthrough-script.md` for the launch storyboard.
