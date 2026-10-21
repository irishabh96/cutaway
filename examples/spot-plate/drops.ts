// The glass drops. Each pair is one signed distance field: two discs joined by a smooth union
// whose reach grows with merge. Its zero contour is traced on a grid, simplified and extruded.
import { cameraOf, circleRing, extrude, onTop, pathOf, type Flat, type Plane, type SolidPaths } from "../../kit/iso-kit";
import { BIG, reachOf, SMALL } from "./rig";
import { at, FLOOR_Z, GLASS_H, P, VIEW, WELLS } from "./geometry";

const TOP = FLOOR_Z + GLASS_H;
/**
 * The blend is full strength between the drops and fades toward their outer sides, so the
 * drops don't swell outward: it is weighted by how squarely a point sits between the two centres.
 */
const OUTER_SHARE = 0.33;
/** Shapes are rebuilt only when merge moves by this much. */
export const QUANTUM = 0.25;

/** The pair's field in its own frame: the big disc at (0, 0), the small one on +x. */
export function fieldAt(x: number, y: number, gap: number, reach: number) {
  const span = BIG + gap + SMALL;
  const toBig = Math.hypot(x, y) - BIG;
  const toSmall = Math.hypot(x - span, y) - SMALL;
  if (reach <= 0) return Math.min(toBig, toSmall);
  // Cosine of the angle between the directions to the two centres: −1 squarely between them.
  const facing = ((-x) * (span - x) + y * y) / ((toBig + BIG) * (toSmall + SMALL) || 1);
  const between = (1 - facing) / 2;
  const k = reach * (OUTER_SHARE + (1 - OUTER_SHARE) * between);
  const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (toSmall - toBig)) / k));
  return toSmall + (toBig - toSmall) * h - k * h * (1 - h);
}

// ---- contour tracing ----

function axis(from: number, to: number, coarse: number, fineFrom: number, fineTo: number, fine: number) {
  const out: number[] = [];
  let at = from;
  while (at < to) {
    out.push(at);
    at += at >= fineFrom && at < fineTo ? fine : coarse;
  }
  out.push(to);
  return out;
}

const signedArea = (ring: Plane[]) =>
  ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length]!;
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;

function simplify(points: Plane[], tolerance: number): Plane[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    const a = points[first]!;
    const b = points[last]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy) || 1;
    let worst = -1;
    let far = 0;
    for (let index = first + 1; index < last; index++) {
      const p = points[index]!;
      const off = Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / length;
      if (off > far) {
        far = off;
        worst = index;
      }
    }
    if (worst >= 0 && far > tolerance) {
      keep[worst] = 1;
      stack.push([first, worst], [worst, last]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

/** Close a traced loop's simplification by splitting it at its two most distant points. */
function simplifyLoop(loop: Plane[], tolerance: number): Plane[] {
  let far = 0;
  let split = 0;
  for (let index = 1; index < loop.length; index++) {
    const d = Math.hypot(loop[index]![0] - loop[0]![0], loop[index]![1] - loop[0]![1]);
    if (d > far) {
      far = d;
      split = index;
    }
  }
  const first = simplify(loop.slice(0, split + 1), tolerance);
  const second = simplify([...loop.slice(split), loop[0]!], tolerance);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

/** The zero contour of a pair's field, as closed rings in the pair's own frame, biggest first. */
export function ringsOf(gap: number, reach: number): Plane[][] {
  const span = BIG + gap + SMALL;
  const middle = BIG + gap / 2;
  const fineHalf = 5 + gap / 2 + reach * 0.3;
  const xs = axis(-BIG - 1.5, span + SMALL + 1.5, 2, middle - fineHalf, middle + fineHalf, 0.6);
  const ys = axis(-BIG - 4, BIG + 4, 1.3, 0, 0, 1.3);
  const columns = xs.length;
  const rows = ys.length;
  const value = new Float64Array(columns * rows);
  for (let i = 0; i < columns; i++) for (let j = 0; j < rows; j++) value[i * rows + j] = fieldAt(xs[i]!, ys[j]!, gap, reach);

  // Each grid edge the contour crosses gets a key (two per grid point: along x, along y)
  // and up to two links to the next crossings round the loop.
  const keys = columns * rows * 2;
  const linkA = new Int32Array(keys).fill(-1);
  const linkB = new Int32Array(keys).fill(-1);
  const link = (a: number, b: number) => {
    if (linkA[a] < 0) linkA[a] = b;
    else linkB[a] = b;
    if (linkA[b] < 0) linkA[b] = a;
    else linkB[b] = a;
  };
  const crossing = (key: number): Plane => {
    const cell = key >> 1;
    const i = Math.floor(cell / rows);
    const j = cell % rows;
    const a = value[cell]!;
    if (key & 1) {
      const b = value[cell + 1]!;
      return [xs[i]!, ys[j]! + (ys[j + 1]! - ys[j]!) * (a / (a - b))];
    }
    const b = value[cell + rows]!;
    return [xs[i]! + (xs[i + 1]! - xs[i]!) * (a / (a - b)), ys[j]!];
  };
  const edges: number[] = [];
  for (let i = 0; i + 1 < columns; i++) {
    for (let j = 0; j + 1 < rows; j++) {
      const at = i * rows + j;
      const va = value[at]!;
      const vb = value[at + rows]!;
      const vc = value[at + rows + 1]!;
      const vd = value[at + 1]!;
      const a = va < 0;
      const b = vb < 0;
      const c = vc < 0;
      const d = vd < 0;
      if (a === b && b === c && c === d) continue;
      const bottom = at * 2;
      const right = (at + rows) * 2 + 1;
      const top = (at + 1) * 2;
      const left = at * 2 + 1;
      edges.length = 0;
      if (a !== b) edges.push(bottom);
      if (b !== c) edges.push(right);
      if (c !== d) edges.push(top);
      if (d !== a) edges.push(left);
      if (edges.length === 2) link(edges[0]!, edges[1]!);
      else if (edges.length === 4) {
        // A saddle: the cell's centre decides which corners connect.
        const centre = va + vb + vc + vd < 0;
        if (centre === a) {
          link(bottom, right);
          link(top, left);
        } else {
          link(bottom, left);
          link(top, right);
        }
      }
    }
  }

  const rings: Plane[][] = [];
  const seen = new Uint8Array(keys);
  for (let start = 0; start < keys; start++) {
    if (seen[start] || linkA[start] < 0) continue;
    const loop: Plane[] = [];
    let previous = -1;
    let current = start;
    while (current >= 0 && !seen[current]) {
      seen[current] = 1;
      loop.push(crossing(current));
      const next: number = linkA[current] !== previous && !seen[linkA[current]!] ? linkA[current]! : linkB[current]!;
      previous = current;
      current = next >= 0 && !seen[next] ? next : -1;
    }
    if (loop.length < 8) continue;
    const ring = simplifyLoop(loop, 0.1);
    const area = signedArea(ring);
    if (Math.abs(area) > 30) rings.push(area > 0 ? ring : ring.reverse());
  }
  return rings.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a))).slice(0, 2);
}

// ---- glass solids ----

export interface GlassPiece extends SolidPaths {
  shine: string;
}

export interface Neck {
  d: string;
  from: Flat;
  to: Flat;
}

export interface PairShape {
  /** One closed outline: the pair has run together (or, at merge = gap, just touches). */
  whole: boolean;
  pieces: GlassPiece[];
  /** Highlights along the concave runs of a whole pair's outline. */
  necks: Neck[];
}

const { sinA, cosA, sinE, cosE } = cameraOf(P);
const LIGHT: Plane = [-sinA, cosA];
/** Plan distance a line of sight travels toward the viewer per unit it rises. */
const SIGHT = cosE / sinE;

function insideRing(ring: Plane[], x: number, y: number) {
  let inside = false;
  for (let index = 0, back = ring.length - 1; index < ring.length; back = index++) {
    const [ax, ay] = ring[index]!;
    const [bx, by] = ring[back]!;
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

/** Whether the glass itself hides a point on its own outline at height z above the floor. */
function hiddenBy(ring: Plane[], [x, y]: Plane, z: number) {
  const reach = (TOP - z) * SIGHT;
  for (let s = 0.7; s < reach; s += 1.1) if (insideRing(ring, x + VIEW[0] * s, y + VIEW[1] * s)) return true;
  return false;
}

/** Outward normal of each edge of a counter-clockwise ring. */
const normalsOf = (ring: Plane[]) =>
  ring.map(([ax, ay], index) => {
    const [bx, by] = ring[(index + 1) % ring.length]!;
    const length = Math.hypot(bx - ax, by - ay) || 1;
    return [(by - ay) / length, -(bx - ax) / length] as Plane;
  });

function runs(flags: boolean[]): number[][] {
  const count = flags.length;
  const start = flags.findIndex((flag, index) => flag && !flags[(index + count - 1) % count]);
  if (start < 0) return flags[0] ? [Array.from({ length: count + 1 }, (_, index) => index % count)] : [];
  const out: number[][] = [];
  let run: number[] | null = null;
  for (let step = 0; step < count; step++) {
    const index = (start + step) % count;
    if (flags[index]) {
      run ??= [index];
      run.push((index + 1) % count);
    } else if (run) {
      out.push(run);
      run = null;
    }
  }
  if (run) out.push(run);
  return out;
}

const vertexNormal = (normals: Plane[], index: number): Plane => {
  const a = normals[(index + normals.length - 1) % normals.length]!;
  const b = normals[index]!;
  const length = Math.hypot(a[0] + b[0], a[1] + b[1]) || 1;
  return [(a[0] + b[0]) / length, (a[1] + b[1]) / length];
};

const insetRun = (ring: Plane[], normals: Plane[], run: number[], by: number) =>
  run.map((index) => {
    const [nx, ny] = vertexNormal(normals, index);
    return [ring[index]![0] - nx * by, ring[index]![1] - ny * by] as Plane;
  });

/** A shine along the top edges that face the light. */
function shineOf(ring: Plane[], normals: Plane[]) {
  const lit = normals.map(([nx, ny]) => nx * LIGHT[0] + ny * LIGHT[1] > 0.6);
  return runs(lit)
    .filter((run) => run.length > 4)
    .map((run) => onTop([ring[run[0]!]!, ...insetRun(ring, normals, run.slice(2, -2), 2.6), ring[run[run.length - 1]!]!], TOP, P))
    .join("");
}

/**
 * Outline of a glass slab whose plan may be concave. Lines the glass itself hides (the far side
 * of the neck behind the near drop) are left out, so the concave neck draws correctly.
 */
function outlineOf(ring: Plane[], normals: Plane[], trim: boolean) {
  const count = ring.length;
  const facing = normals.map(([nx, ny]) => nx * VIEW[0] + ny * VIEW[1] > 1e-9);
  const hidden = ring.map((point) => trim && hiddenBy(ring, point, FLOOR_Z));
  const parts: string[] = [];
  for (const run of runs(facing.map((flag) => !flag))) parts.push(onTop(run.map((index) => ring[index]!), TOP, P));
  for (const run of runs(facing)) {
    let piece: Plane[] = [];
    for (const index of run) {
      if (hidden[index]) {
        if (piece.length > 1) parts.push(onTop(piece, FLOOR_Z, P));
        piece = [];
      } else piece.push(ring[index]!);
    }
    if (piece.length > 1) parts.push(onTop(piece, FLOOR_Z, P));
  }
  for (let index = 0; index < count; index++) {
    if (facing[(index + count - 1) % count] === facing[index]) continue;
    let low = FLOOR_Z;
    if (trim) {
      for (const share of [0, 0.25, 0.5, 0.75]) {
        low = FLOOR_Z + GLASS_H * share;
        if (!hiddenBy(ring, ring[index]!, low)) break;
      }
    }
    const [x, y] = ring[index]!;
    parts.push(pathOf([at([x, y, TOP]), at([x, y, low])]));
  }
  return parts.join("");
}

function pieceOf(ring: Plane[], round: boolean, trim: boolean): GlassPiece {
  const paths = extrude(ring, FLOOR_Z, GLASS_H, P, { convex: round, bevel: 1.2 });
  const normals = normalsOf(ring);
  return { ...paths, outline: round ? paths.outline : outlineOf(ring, normals, trim), shine: shineOf(ring, normals) };
}

function necksOf(ring: Plane[]): Neck[] {
  const count = ring.length;
  const concave = ring.map((point, index) => {
    const before = ring[(index + count - 1) % count]!;
    const after = ring[(index + 1) % count]!;
    return (point[0] - before[0]) * (after[1] - point[1]) - (point[1] - before[1]) * (after[0] - point[0]) < -1e-6;
  });
  // A run of edges is concave when both its ends turn inward; collect runs of concave vertices.
  const found: number[][] = [];
  let run: number[] = [];
  const start = concave.findIndex((flag, index) => !flag && concave[(index + 1) % count]);
  if (start < 0) return [];
  for (let step = 1; step <= count; step++) {
    const index = (start + step) % count;
    if (concave[index]) run.push(index);
    else if (run.length) {
      found.push(run);
      run = [];
    }
  }
  const normals = normalsOf(ring);
  const lengthOf = (indices: number[]) =>
    indices.slice(1).reduce((sum, index, at) => sum + Math.hypot(ring[index]![0] - ring[indices[at]!]![0], ring[index]![1] - ring[indices[at]!]![1]), 0);
  return found
    .filter((indices) => indices.length > 2 && lengthOf(indices) > 4)
    .sort((a, b) => lengthOf(b) - lengthOf(a))
    .slice(0, 2)
    .map((indices) => {
      const line = insetRun(ring, normals, indices, 1.1).map(([x, y]) => at([x, y, TOP]));
      const tenth = ([x, y]: Flat): Flat => [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
      return { d: pathOf(line), from: tenth(line[0]!), to: tenth(line[line.length - 1]!) };
    });
}

const place = (ring: Plane[], [x, y]: Plane): Plane[] => ring.map(([u, w]) => [u + x, w + y]);

const plainCache = new Map<number, PairShape>();
const shapeCache = new Map<string, PairShape>();

function plainShape(well: number): PairShape {
  const known = plainCache.get(well);
  if (known) return known;
  const { big, small } = WELLS[well]!;
  const shape: PairShape = {
    whole: false,
    pieces: [pieceOf(circleRing(big[0], big[1], BIG, 56), true, false), pieceOf(circleRing(small[0], small[1], SMALL, 44), true, false)],
    necks: [],
  };
  plainCache.set(well, shape);
  return shape;
}

/** The quantised merge a shape is built for. */
export const quantise = (merge: number) => Math.round(merge / QUANTUM) * QUANTUM;

/** Whether the shape for this well and merge is ready without building anything. */
export function isBuilt(well: number, merge: number) {
  const q = quantise(merge);
  return reachOf(q) <= WELLS[well]!.gap || shapeCache.has(`${well}:${q}`);
}

/** The glass of one well at a merge value, built once per quantum and cached. */
export function pairShape(well: number, merge: number): PairShape {
  const { gap, big } = WELLS[well]!;
  const q = quantise(merge);
  // Far from merging the blend never reaches the other drop: two plain discs.
  if (reachOf(q) <= gap) return plainShape(well);
  const key = `${well}:${q}`;
  const known = shapeCache.get(key);
  if (known) return known;
  // At exactly merge = gap the outlines touch at one point; widen the reach a hair so the pair
  // is drawn touching as one shape rather than as a pinched contour.
  const reach = q >= gap ? Math.max(reachOf(q), 2 * gap + 0.6) : reachOf(q);
  const rings = ringsOf(gap, reach).map((ring) => place(ring, big));
  const whole = rings.length === 1;
  const ordered = whole ? rings : [...rings].sort((a, b) => centroidDepth(a) - centroidDepth(b));
  const shape: PairShape = {
    whole,
    pieces: ordered.map((ring) => pieceOf(ring, false, whole)),
    necks: whole ? necksOf(rings[0]!) : [],
  };
  shapeCache.set(key, shape);
  return shape;
}

function centroidDepth(ring: Plane[]) {
  const [sx, sy] = ring.reduce(([x, y], point) => [x + point[0], y + point[1]], [0, 0]);
  return (sx / ring.length) * VIEW[0] + (sy / ring.length) * VIEW[1];
}

/** The narrowest width of a whole pair's outline across the gap, px (for checking the field). */
export function neckWidth(gap: number, merge: number) {
  const rings = ringsOf(gap, reachOf(merge));
  if (rings.length !== 1) return 0;
  const ring = rings[0]!;
  let narrowest = Infinity;
  for (let x = BIG - 4; x <= BIG + gap + 4; x += 0.25) {
    const ys: number[] = [];
    for (let index = 0; index < ring.length; index++) {
      const a = ring[index]!;
      const b = ring[(index + 1) % ring.length]!;
      if ((a[0] - x) * (b[0] - x) <= 0 && a[0] !== b[0]) ys.push(a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]));
    }
    if (ys.length >= 2) narrowest = Math.min(narrowest, Math.max(...ys) - Math.min(...ys));
  }
  return narrowest;
}

