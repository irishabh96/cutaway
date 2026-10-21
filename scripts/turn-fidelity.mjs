// Fidelity of the 3D runtime against the kit's own builders.
//
// Turning a root turn group by θ about its vertical pivot is the kit's drawing at azimuth
// P.azimuth − θ, moved on screen by where the pivot lands under P and under that P′. So each
// live part the runtime emits at θ must match the kit builder drawn at P′(θ) plus that shift.
//
//   identity(T, P, angles, { plant })  prisms against k.extrude / G.prismOf
//   rounds(T, P, angles, { only })     rounds and lathes against G.lathe, at 1× and 10×
//   tubes(T, P, angles)                tube chunks against tubePieces at 10×
//
// Each returns { pass, text, worst }. TURN.emit is looked up on the TURN object on every call
// (never cached), so a test that wraps it after this module loads is still measured.
import { TURN } from "../kit/turn.mjs";
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";
import { tubePieces } from "../kit/tube.mjs";

const PRISM_LIMIT = 0.06;
const ROUND_LIMIT = 0.05;
const BAND_LIMIT = 0.5;
const TUBE_LIMIT = 0.05;
const CELL = 0.1;
const SEAM = 0.4; // the stroke a seamless part's bands are drawn with

// ---------------------------------------------------------------------------
// Paths and distances.
const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

function subpaths(d) {
  const out = [];
  if (!d) return out;
  let current = null;
  for (const [, command, args] of String(d).matchAll(/([MLZmlz])([^MLZmlz]*)/g)) {
    const values = (args.match(NUMBER) ?? []).map(Number);
    if (command === "M" || command === "m") {
      current = { points: [], closed: false };
      out.push(current);
      for (let i = 0; i + 1 < values.length; i += 2) current.points.push([values[i], values[i + 1]]);
    } else if (command === "L" || command === "l") {
      if (!current) {
        current = { points: [], closed: false };
        out.push(current);
      }
      for (let i = 0; i + 1 < values.length; i += 2) current.points.push([values[i], values[i + 1]]);
    } else if (current) current.closed = true;
  }
  return out;
}

const moveAll = (list, dx, dy, scale = 1) => list.map((sub) => ({ closed: sub.closed, points: sub.points.map(([x, y]) => [x * scale + dx, y * scale + dy]) }));

function segmentDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const span = dx * dx + dy * dy;
  const t = span > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / span)) : 0;
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}

// The same distance in the max norm: how far apart in x or y, the way rounding moves a point.
// The function is convex and piecewise linear in t, so its least value is at a breakpoint.
function squareDistance(p, a, b) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const ex = p[0] - a[0];
  const ey = p[1] - a[1];
  const at = (t) => Math.max(Math.abs(ex - t * ux), Math.abs(ey - t * uy));
  let best = Math.min(at(0), at(1));
  for (const t of [ux ? ex / ux : NaN, uy ? ey / uy : NaN, ux - uy ? (ex - ey) / (ux - uy) : NaN, ux + uy ? (ex + ey) / (ux + uy) : NaN]) if (t > 0 && t < 1) best = Math.min(best, at(t));
  return best;
}

function toPolylines(p, list, square = false) {
  let best = Infinity;
  const metric = square ? squareDistance : segmentDistance;
  for (const sub of list) {
    const pts = sub.points;
    if (pts.length === 1) best = Math.min(best, metric(p, pts[0], pts[0]));
    const n = sub.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const d = metric(p, pts[i], pts[(i + 1) % pts.length]);
      if (d < best) best = d;
    }
  }
  return best;
}

const oneWay = (from, to, square = false) => {
  let worst = 0;
  for (const sub of from) for (const p of sub.points) worst = Math.max(worst, toPolylines(p, to, square));
  return worst;
};
const apart = (A, B, square = false) => {
  const a = A.some((s) => s.points.length);
  const b = B.some((s) => s.points.length);
  if (!a && !b) return 0;
  if (!a || !b) return Infinity;
  return Math.max(oneWay(A, B, square), oneWay(B, A, square));
};

function matrixOf(text) {
  const values = (String(text).match(NUMBER) ?? []).map(Number);
  return values.length === 6 ? values : [1, 0, 0, 1, 0, 0];
}
const through = (list, [a, b, c, d, e, f]) => list.map((sub) => ({ closed: sub.closed, points: sub.points.map(([x, y]) => [a * x + c * y + e, b * x + d * y + f]) }));

// ---------------------------------------------------------------------------
// The scene, the cameras and the reference view for each angle.
function rootOf(group) {
  let g = group;
  while (g && g.parent) g = g.parent;
  return g;
}

function checked(part) {
  if (part.dead || !part.group || part.group.kind === "free") return false;
  const root = rootOf(part.group);
  return Boolean(root) && root.kind === "turn";
}

function sceneOf(T) {
  if (!T.data) throw new Error("turn-fidelity: T has not been built (call T.build first)");
  return TURN.prepare(T.data, { unit: 1 });
}

function camsAt(T, scene, theta) {
  const values = {};
  for (const g of T.groups) values[g.name] = g.kind === "free" ? null : g.kind === "turn" && !g.parent ? theta : 0;
  return TURN.cams(scene, values);
}

function referenceView(P, part, theta, extra = 0) {
  const root = rootOf(part.group);
  const turned = { ...P, azimuth: (P.azimuth ?? 45) - (root ? theta : 0) - extra };
  if (!root) return { P: turned, shift: [0, 0] };
  const pivot = [root.origin[0], root.origin[1], 0];
  const a = k.iso(pivot, P);
  const b = k.iso(pivot, turned);
  return { P: turned, shift: [a[0] - b[0], a[1] - b[1]] };
}

function emitted(scene, cams, part) {
  const run = scene.runs[part.id];
  const cam = run.group >= 0 ? cams[run.group] : cams.world;
  return { run, f: TURN.emit(run, cam, TURN.frame(run)) };
}

const roleOf = (run, f, name) => (run.role[name] === undefined ? null : f.d[run.role[name]]);
const fmt = (v, digits = 4) => (Number.isFinite(v) ? v.toFixed(digits) : "∞");
const angleText = (theta) => `${Math.round(theta * 1000) / 1000}°`;

// ---------------------------------------------------------------------------
// Prisms.
function prismReference(part, view) {
  const { F, ring, s0, s1 } = part.world;
  if (part.spec.up) {
    const plan = ring.map(([x, y]) => [F.o[0] + F.u[0] * x + F.v[0] * y, F.o[1] + F.u[1] * x + F.v[1] * y]);
    const z = F.a[2] > 0 ? F.o[2] + F.a[2] * s0 : F.o[2] + F.a[2] * s1;
    const paths = k.extrude(plan, z, s1 - s0, view.P);
    return { fill: paths.fill, top: paths.top, tones: paths.shades };
  }
  const paths = G.prismOf(F, ring, s0, s1, view.P);
  return { fill: paths.fill, top: null, tones: [...paths.shades, paths.top] };
}

export function identity(T, P, angles, { plant = null } = {}) {
  const scene = sceneOf(T);
  const parts = T.parts.filter((part) => part.kind === "prism" && checked(part));
  const worstOf = { outline: 0, top: 0, faces: 0 };
  let compared = 0;
  let skipped = 0;
  let missing = 0;
  const perPart = new Map();
  const note = (part, what, value, theta) => {
    const key = `${part.name}|${what}`;
    const prior = perPart.get(key);
    if (!prior || value > prior.value) perPart.set(key, { name: part.name, what, value, theta });
  };
  for (const theta of angles) {
    const cams = camsAt(T, scene, theta);
    for (const part of parts) {
      const { run, f } = emitted(scene, cams, part);
      const view = referenceView(P, part, theta, part.name === plant ? 2 : 0);
      const kit = prismReference(part, view);
      const [dx, dy] = view.shift;
      const kitFill = moveAll(subpaths(kit.fill), dx, dy);
      const cut = Boolean(part.spec.cuts && part.spec.cuts.length);
      let outline = apart(subpaths(roleOf(run, f, cut ? "fill" : "edge")), kitFill, true);
      if (cut) outline = Math.max(outline, oneWay(subpaths(roleOf(run, f, "edge")), kitFill, true));
      worstOf.outline = Math.max(worstOf.outline, outline);
      note(part, "outline", outline, theta);
      if (run.up && kit.top && run.role.top !== undefined) {
        const plan = T.parts[part.id].planPath ?? part.planPath;
        const top = apart(through(subpaths(plan), matrixOf(f.t[run.role.top])), moveAll(subpaths(kit.top), dx, dy), true);
        worstOf.top = Math.max(worstOf.top, top);
        note(part, "top", top, theta);
      }
      const kitFaces = kit.tones.map((d) => moveAll(subpaths(d), dx, dy).filter((sub) => sub.points.length >= 3));
      for (const role of run.roles) {
        if (role.type !== "face") continue;
        const index = run.role[role.name];
        const d = f.d[index];
        if (!d) continue;
        const q = f.q[index];
        if (q % TURN.q !== 0) {
          skipped++;
          continue;
        }
        const tone = q / TURN.q;
        const candidates = kitFaces[tone] ?? [];
        if (!candidates.length) {
          missing++;
          note(part, "missing", Infinity, theta);
          continue;
        }
        const face = subpaths(d);
        let best = Infinity;
        for (const other of candidates) best = Math.min(best, apart(face, [other], true));
        compared++;
        worstOf.faces = Math.max(worstOf.faces, best);
        note(part, "faces", best, theta);
      }
    }
  }
  const limitOf = { outline: PRISM_LIMIT, top: PRISM_LIMIT, faces: PRISM_LIMIT, missing: 0 };
  const worst = [...perPart.values()]
    .filter((entry) => entry.value > limitOf[entry.what])
    .sort((a, b) => b.value - a.value)
    .map((entry) => `${entry.name} ${entry.what} ${fmt(entry.value, 3)} at ${angleText(entry.theta)}`);
  const pass = worstOf.outline <= PRISM_LIMIT && worstOf.top <= PRISM_LIMIT && worstOf.faces <= PRISM_LIMIT && missing === 0;
  const text = `prisms at ${angles.length} angles: outline ${fmt(worstOf.outline)} px · top ${fmt(worstOf.top)} px · faces ${fmt(worstOf.faces)} px over ${compared} faces (${skipped} in crossfade windows, ${missing} with no kit face of that tone)`;
  return { pass, text, worst };
}

// ---------------------------------------------------------------------------
// Rounds and lathes.
function roundMeridian(part) {
  if (part.kind === "lathe") {
    const { profile, curve } = part.world;
    const side = profile.map(([s, r], i) => (i === 0 || i === profile.length - 1 ? [s, r] : [s, r, 1]));
    const meridian = [...(curve.radius(curve.s0) > 1e-6 ? [[curve.s0, 0]] : []), ...side, ...(curve.radius(curve.s1) > 1e-6 ? [[curve.s1, 0]] : [])];
    return { meridian, smooth: { radius: curve.radius, slope: curve.slope } };
  }
  const { s0, s1, r0, r1, ends } = part.world;
  const domed = ends.includes("dome");
  const meridian = [];
  if (ends[0] === "flat") meridian.push([s0, 0]);
  if (ends[0] === "dome") for (let j = 0; j < 8; j++) {
    const b = (j / 8) * (Math.PI / 2);
    meridian.push([s0 - r0 * Math.cos(b), r0 * Math.sin(b), j ? 1 : 0]);
  }
  meridian.push(domed ? [s0, r0, 1] : [s0, r0]);
  meridian.push(domed ? [s1, r1, 1] : [s1, r1]);
  if (ends[1] === "dome") for (let j = 7; j >= 0; j--) {
    const b = (j / 8) * (Math.PI / 2);
    meridian.push([s1 + r1 * Math.cos(b), r1 * Math.sin(b), j ? 1 : 0]);
  }
  if (ends[1] === "flat") meridian.push([s1, 0]);
  if (!domed) return { meridian, smooth: true };
  const g = (r1 - r0) / (s1 - s0 || 1);
  const radius = (s) => {
    if (s < s0) return ends[0] === "dome" ? Math.sqrt(Math.max(0, r0 * r0 - (s0 - s) * (s0 - s))) : r0;
    if (s > s1) return ends[1] === "dome" ? Math.sqrt(Math.max(0, r1 * r1 - (s - s1) * (s - s1))) : r1;
    return r0 + g * (s - s0);
  };
  const slope = (s) => {
    if (s < s0 && ends[0] === "dome") return (s0 - s) / Math.max(1e-9, radius(s));
    if (s > s1 && ends[1] === "dome") return -(s - s1) / Math.max(1e-9, radius(s));
    return g;
  };
  return { meridian, smooth: { radius, slope } };
}

function latheAt(meridian, F, view, smooth, scale) {
  const P = scale === 1 ? view.P : { ...view.P, origin: [view.P.origin[0] * scale, view.P.origin[1] * scale], scale: view.P.scale * scale };
  const paths = G.lathe(meridian, F, P, { smooth });
  const back = (d) => moveAll(subpaths(d), view.shift[0], view.shift[1], 1 / scale);
  return { fill: back(paths.fill), tones: [...paths.shades, paths.top].map(back) };
}

// Paints a set of closed subpaths into the grid (nonzero rule). With a stroke width, the outline
// is painted too, as the page strokes each band of a seamless part with its own colour.
function rasterInto(grid, list, value, stroke = 0) {
  const { x0, y0, w, h, cells } = grid;
  if (stroke > 0) {
    const half = stroke / 2;
    for (const sub of list) {
      const pts = sub.points;
      if (pts.length < 2) continue;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const c0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - half - x0) / CELL));
        const c1 = Math.min(w - 1, Math.ceil((Math.max(a[0], b[0]) + half - x0) / CELL));
        const r0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - half - y0) / CELL));
        const r1 = Math.min(h - 1, Math.ceil((Math.max(a[1], b[1]) + half - y0) / CELL));
        for (let row = r0; row <= r1; row++)
          for (let col = c0; col <= c1; col++) if (segmentDistance([x0 + (col + 0.5) * CELL, y0 + (row + 0.5) * CELL], a, b) <= half) cells[row * w + col] = value;
      }
    }
  }
  const edges = [];
  for (const sub of list) {
    const pts = sub.points;
    if (pts.length < 3) continue;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (a[1] === b[1]) continue;
      edges.push(a[1] < b[1] ? [a[0], a[1], b[0], b[1], 1] : [b[0], b[1], a[0], a[1], -1]);
    }
  }
  if (!edges.length) return;
  const crossings = [];
  for (let row = 0; row < h; row++) {
    const y = y0 + (row + 0.5) * CELL;
    crossings.length = 0;
    for (const [ax, ay, bx, by, dir] of edges) {
      if (y < ay || y >= by) continue;
      crossings.push([ax + ((bx - ax) * (y - ay)) / (by - ay), dir]);
    }
    if (crossings.length < 2) continue;
    crossings.sort((p, q) => p[0] - q[0]);
    let winding = 0;
    for (let c = 0; c < crossings.length - 1; c++) {
      winding += crossings[c][1];
      if (!winding) continue;
      const from = Math.max(0, Math.ceil((crossings[c][0] - x0) / CELL - 0.5));
      const to = Math.min(w - 1, Math.floor((crossings[c + 1][0] - x0) / CELL - 0.5));
      for (let col = from; col <= to; col++) cells[row * w + col] = value;
    }
  }
}

function erode(mask, w, h, reach) {
  let current = mask;
  for (let pass = 0; pass < reach; pass++) {
    const next = new Uint8Array(w * h);
    for (let row = 1; row < h - 1; row++)
      for (let col = 1; col < w - 1; col++) {
        const at = row * w + col;
        next[at] = current[at] && current[at - 1] && current[at + 1] && current[at - w] && current[at + w] && current[at - w - 1] && current[at - w + 1] && current[at + w - 1] && current[at + w + 1] ? 1 : 0;
      }
    current = next;
  }
  return current;
}

function bandCompare(emittedTones, kitTones, emittedOutline, kitOutline, caps) {
  const all = [...emittedOutline, ...kitOutline];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const sub of all) for (const [x, y] of sub.points) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
  if (!Number.isFinite(x0)) return { cells: 0, differ: 0, worst: 0 };
  x0 -= 1;
  y0 -= 1;
  const w = Math.ceil((x1 + 1 - x0) / CELL);
  const h = Math.ceil((y1 + 1 - y0) / CELL);
  const grid = (fill) => ({ x0, y0, w, h, cells: new Int8Array(w * h).fill(fill) });
  const mine = grid(-1);
  const kit = grid(-1);
  emittedTones.forEach((list, tone) => rasterInto(mine, list, tone, SEAM));
  kitTones.forEach((list, tone) => rasterInto(kit, list, tone, SEAM));
  const inside = (list) => {
    const g = grid(0);
    rasterInto(g, list, 1);
    return Uint8Array.from(g.cells);
  };
  const reach = 3;
  const a = erode(inside(emittedOutline), w, h, reach);
  const b = erode(inside(kitOutline), w, h, reach);
  let skip = null;
  if (caps.length) {
    const c = inside(caps);
    skip = new Uint8Array(w * h);
    const span = reach + 2;
    for (let row = 0; row < h; row++)
      for (let col = 0; col < w; col++) {
        if (!c[row * w + col]) continue;
        for (let dy = -span; dy <= span; dy++)
          for (let dx = -span; dx <= span; dx++) {
            const r = row + dy;
            const q = col + dx;
            if (r >= 0 && r < h && q >= 0 && q < w) skip[r * w + q] = 1;
          }
      }
  }
  let cells = 0;
  let differ = 0;
  let worst = 0;
  // The nearest kit cell of that tone; a cell inside the kit's outline that its bands leave
  // uncovered (the kit draws no band there, as on a dome seen nearly end-on) counts as a match.
  const near = (row, col, tone) => {
    for (let ring = 1; ring <= 40; ring++) {
      let best = Infinity;
      for (let dy = -ring; dy <= ring; dy++)
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const r = row + dy;
          const q = col + dx;
          if (r < 0 || r >= h || q < 0 || q >= w) continue;
          const other = kit.cells[r * w + q];
          if (other === tone || (other < 0 && b[r * w + q])) best = Math.min(best, Math.hypot(dx, dy));
        }
      if (best < Infinity) return best * CELL;
    }
    return Infinity;
  };
  for (let row = 0; row < h; row++)
    for (let col = 0; col < w; col++) {
      const at = row * w + col;
      if (!a[at] || !b[at] || (skip && skip[at])) continue;
      const tone = mine.cells[at];
      if (tone < 0 || kit.cells[at] < 0) continue;
      cells++;
      if (tone === kit.cells[at]) continue;
      differ++;
      worst = Math.max(worst, near(row, col, tone));
    }
  return { cells, differ, worst };
}

export function rounds(T, P, angles, { only = null } = {}) {
  const scene = sceneOf(T);
  const parts = T.parts.filter((part) => (part.kind === "round" || part.kind === "lathe") && checked(part) && (!only || only.test(part.name)));
  let frames = 0;
  let coarse = 0;
  let fine = 0;
  let band = 0;
  let cells = 0;
  let differ = 0;
  const lines = [];
  for (const theta of angles) {
    const cams = camsAt(T, scene, theta);
    for (const part of parts) {
      const { run, f } = emitted(scene, cams, part);
      const view = referenceView(P, part, theta);
      const { meridian, smooth } = roundMeridian(part);
      const F = part.world.F;
      const kit1 = latheAt(meridian, F, view, smooth, 1);
      const kit10 = latheAt(meridian, F, view, smooth, 10);
      const cut = Boolean(part.spec.cuts && part.spec.cuts.length);
      const mineOutline = subpaths(roleOf(run, f, cut ? "fill" : "edge"));
      const at1 = apart(mineOutline, kit1.fill);
      let at10 = apart(mineOutline, kit10.fill);
      if (cut) at10 = Math.max(at10, oneWay(subpaths(roleOf(run, f, "edge")), kit10.fill));
      const tones = [0, 1, 2, 3, 4].map((t) => subpaths(roleOf(run, f, `s${t}`)));
      const caps = [];
      for (const name of ["k0", "k1"]) {
        const index = run.role[name];
        if (index === undefined || !f.d[index]) continue;
        const tone = Math.max(0, Math.min(4, Math.round(f.q[index] / TURN.q)));
        tones[tone] = [...tones[tone], ...subpaths(f.d[index])];
        caps.push(...subpaths(f.d[index]));
      }
      const fillOutline = subpaths(roleOf(run, f, "fill"));
      const bands = bandCompare(tones, kit10.tones, fillOutline, kit10.fill, part.kind === "lathe" ? caps : []);
      frames++;
      coarse = Math.max(coarse, at1);
      fine = Math.max(fine, at10);
      band = Math.max(band, bands.worst);
      cells += bands.cells;
      differ += bands.differ;
      if (at10 > ROUND_LIMIT || bands.worst > BAND_LIMIT) lines.push({ score: Math.max(at10 / ROUND_LIMIT, bands.worst / BAND_LIMIT), text: `${part.name} at ${angleText(theta)}: outline ${fmt(at10, 3)} px, band ${fmt(bands.worst, 2)} px` });
    }
  }
  const pass = fine <= ROUND_LIMIT && band <= BAND_LIMIT;
  const text = `rounds: ${frames} frames at ${angles.length} angles: outline vs kit ${fmt(coarse)} px (kit rounds to 0.1), vs kit at 10x ${fmt(fine)} px · band boundaries ≤ ${fmt(band, 2)} px apart (${differ} of ${cells} interior cells differ)`;
  return { pass, text, worst: lines.sort((a, b) => b.score - a.score).slice(0, 12).map((line) => line.text) };
}

// ---------------------------------------------------------------------------
// Tubes.
function pathDistance(mine, kit) {
  if (mine.length !== kit.length) return { value: Infinity, why: `${mine.length} subpaths against ${kit.length}` };
  let worst = 0;
  for (let i = 0; i < mine.length; i++) {
    const a = mine[i];
    const b = kit[i];
    if (a.points.length === b.points.length) {
      for (let j = 0; j < a.points.length; j++) worst = Math.max(worst, Math.abs(a.points[j][0] - b.points[j][0]), Math.abs(a.points[j][1] - b.points[j][1]));
    } else {
      if (a.points.length < 2 || b.points.length < 2) return { value: Infinity, why: `subpath ${i} has ${a.points.length} points against ${b.points.length}` };
      worst = Math.max(worst, oneWay([a], [b]), oneWay([b], [a]));
    }
  }
  return { value: worst, why: "" };
}

function segmentsOf(list) {
  const out = [];
  for (const sub of list) for (let i = 0; i + 1 < sub.points.length; i++) out.push([sub.points[i], sub.points[i + 1]]);
  return out;
}

function ringDistance(mine, kit) {
  if (mine.length !== kit.length) return { value: Infinity, why: `${mine.length} ring segments against ${kit.length}` };
  const one = (from, to) => {
    let worst = 0;
    for (const [a, b] of from) {
      let best = Infinity;
      for (const [c, d] of to) {
        const straight = Math.max(Math.hypot(a[0] - c[0], a[1] - c[1]), Math.hypot(b[0] - d[0], b[1] - d[1]));
        const crossed = Math.max(Math.hypot(a[0] - d[0], a[1] - d[1]), Math.hypot(b[0] - c[0], b[1] - c[1]));
        best = Math.min(best, straight, crossed);
      }
      worst = Math.max(worst, best);
    }
    return worst;
  };
  return { value: Math.max(one(mine, kit), one(kit, mine)), why: "" };
}

export function tubes(T, P, angles) {
  const scene = sceneOf(T);
  const routes = T.routes.filter((route) => !route.group || (route.group.kind !== "free" && rootOf(route.group).kind === "turn"));
  const worstOf = { body: 0, shine: 0, shade: 0, edges: 0, rings: 0 };
  let frames = 0;
  const lines = [];
  const fail = (text) => lines.length < 20 && lines.push(text);
  for (const theta of angles) {
    const cams = camsAt(T, scene, theta);
    for (const route of routes) {
      const chunks = T.parts.filter((part) => part.route === route.name && !part.dead).sort((a, b) => a.chunk - b.chunk);
      const view = route.group ? referenceView(P, { group: route.group }, theta) : { P, shift: [0, 0] };
      const P10 = { ...view.P, origin: [view.P.origin[0] * 10, view.P.origin[1] * 10], scale: view.P.scale * 10 };
      const pieces = tubePieces(route.world, route.r, P10, { maxLength: route.chunk, spacing: route.spacing, gaps: route.gaps, breaks: route.breaks, caps: route.caps, stripes: route.wide, rings: route.rings });
      if (pieces.length !== chunks.length) {
        fail(`${route.name} at ${angleText(theta)}: ${chunks.length} chunks against ${pieces.length} kit pieces`);
        worstOf.body = Infinity;
        continue;
      }
      const back = (d) => moveAll(subpaths(d), view.shift[0], view.shift[1], 0.1);
      chunks.forEach((part, index) => {
        const piece = pieces[index];
        const { run, f } = emitted(scene, cams, part);
        frames++;
        for (const role of ["body", "shine", "shade", "edges"]) {
          if (run.role[role] === undefined) continue;
          const { value, why } = pathDistance(subpaths(f.d[run.role[role]]), back(piece[role]));
          worstOf[role] = Math.max(worstOf[role], value);
          if (value > TUBE_LIMIT) fail(`${part.name} ${role} at ${angleText(theta)}: ${why || `${fmt(value, 3)} px`}`);
        }
        if (route.rings) {
          const mine = [];
          for (const role of run.roles) if (role.type === "slot" && role.name.startsWith("r")) mine.push(...segmentsOf(subpaths(f.d[run.role[role.name]])));
          const kit = [];
          for (const ring of piece.rings) if (ring.alpha * 32 >= 0.5) kit.push(...segmentsOf(back(ring.d)));
          const { value, why } = ringDistance(mine, kit);
          worstOf.rings = Math.max(worstOf.rings, value);
          if (value > TUBE_LIMIT) fail(`${part.name} rings at ${angleText(theta)}: ${why || `${fmt(value, 3)} px`}`);
        }
      });
    }
  }
  const pass = Object.values(worstOf).every((v) => v <= TUBE_LIMIT);
  const text = `tubes: ${frames} chunk frames at ${angles.length} angles against tubePieces at 10x: body ${fmt(worstOf.body)} · shine ${fmt(worstOf.shine)} · shade ${fmt(worstOf.shade)} · edges ${fmt(worstOf.edges)} · rings ${fmt(worstOf.rings)} px`;
  return { pass, text, worst: lines };
}
