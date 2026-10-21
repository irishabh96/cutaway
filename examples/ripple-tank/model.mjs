// Ripple tank physics: capillary-gravity waves on shallow water, two in-phase
// point sources, and the lens action of the rippled surface on a lamp's light.
// Pure functions, no DOM. The build inlines this file with `export ` removed,
// so it must stay valid as a plain script (no imports, no export lists).

export const WATER = {
  depth: 0.006, // m
  gravity: 9.81, // m/s^2
  tension: 0.0728, // N/m
  density: 998, // kg/m^3
  index: 1.333,
  viscosity: 1.0e-6, // m^2/s, kinematic
  glassIndex: 1.52,
};

export const RANGE = { f: [8, 28], d: [20, 80] };
export const START = { f: 16, d: 50 };
export const BEAT = 0.75; // Hz: the strobe runs this much slower than the dippers
export const STEEPNESS = 0.03; // ka
export const REACH = 24; // mm: near-source length of the spreading law

const TWO_PI = Math.PI * 2;

// omega(k) for k in 1/m, finite depth.
export function omegaOf(k, water = WATER) {
  const { gravity, tension, density, depth } = water;
  return Math.sqrt((gravity * k + (tension * k ** 3) / density) * Math.tanh(k * depth));
}

// Invert the dispersion relation by bisection. Returns k in 1/m.
export function wavenumberOf(f, water = WATER) {
  const target = TWO_PI * f;
  let lo = 1;
  let hi = 20000;
  for (let pass = 0; pass < 80; pass++) {
    const mid = 0.5 * (lo + hi);
    if (omegaOf(mid, water) < target) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

// Everything about one travelling wave at frequency f, in SI units.
export function waveOf(f, water = WATER) {
  const k = wavenumberOf(f, water);
  const omega = TWO_PI * f;
  const dk = k * 1e-5;
  const group = (omegaOf(k + dk, water) - omegaOf(k - dk, water)) / (2 * dk);
  const nu = water.viscosity;
  const bulk = 2 * nu * k * k;
  const bottom = (k * Math.sqrt((nu * omega) / 2)) / Math.sinh(2 * k * water.depth);
  const damping = bulk + bottom; // 1/s, amplitude
  return {
    k,
    wavelength: TWO_PI / k,
    phase: omega / k,
    group,
    damping,
    decay: damping / group, // 1/m
  };
}

export const nodalCount = (d, wavelength) => 2 * Math.floor(d / wavelength + 0.5);

// Where the nodal hyperbolas cross the line through both dippers, measured from the midpoint.
export function nodalVertices(d, wavelength) {
  const out = [];
  for (let m = 0; (m + 0.5) * wavelength < d; m++) {
    const at = ((m + 0.5) * wavelength) / 2;
    out.push(-at, at);
  }
  return out.sort((a, b) => a - b);
}

// Point lamp at height lamp, water surface at water, paper at paper.
export const magnificationOf = ({ lamp, water, paper }) => (lamp - paper) / (lamp - water);

// The lens lever: how far a unit surface slope moves the light on the paper, referred
// back to the water plane. Refraction at the surface tilts the ray by (1 - 1/n) of the
// slope; the tilt then grows through water, glass and air by each medium's index ratio.
export function causticDistanceOf({ lamp, water, floor, bed, paper }, medium = WATER) {
  const n = medium.index;
  const tilt = 1 - 1 / n;
  const lever = tilt * ((water - floor) + (floor - bed) * (n / medium.glassIndex) + (bed - paper) * n);
  return lever / magnificationOf({ lamp, water, paper });
}

// Fraction of a crest's focal length at which the paper sits: D * a * k^2, k per mm.
export const focusOf = (caustic, amplitude, kmm) => caustic * amplitude * kmm * kmm;

export function stateOf(f, d, optics) {
  const wave = waveOf(f);
  const kmm = wave.k / 1000;
  const amplitude = STEEPNESS / kmm;
  return {
    f,
    d,
    wavelength: wave.wavelength * 1000,
    k: kmm,
    phase: wave.phase,
    group: wave.group,
    decay: wave.decay / 1000,
    damping: wave.damping,
    nodal: nodalCount(d, wave.wavelength * 1000),
    strobe: f - BEAT,
    amplitude,
    focus: focusOf(optics.caustic, amplitude, kmm),
    projected: wave.wavelength * 1000 * optics.magnification,
  };
}

export const readoutOf = (s) =>
  `f ${s.f.toFixed(1)} Hz · λ ${(s.wavelength / 10).toFixed(2)} cm · d ${(s.d / 10).toFixed(1)} cm · ${s.nodal} nodal lines`;

export const spokenOf = (s) =>
  `${s.f.toFixed(1)} hertz, wavelength ${(s.wavelength / 10).toFixed(2)} centimetres, dippers ${(s.d / 10).toFixed(1)} centimetres apart, ${s.nodal} nodal lines`;

// Cast a water-surface point from the lamp down onto the paper plane.
function castOnPaper([x, y], lamp, water, paper) {
  const t = (lamp[2] - paper) / (lamp[2] - water);
  return [lamp[0] + (x - lamp[0]) * t, lamp[1] + (y - lamp[1]) * t, paper];
}

// Split a polyline into the runs that lie inside the box, dropping single points.
function clipRuns(points, [x0, y0, x1, y1]) {
  const runs = [];
  let run = [];
  for (const point of points) {
    const inside = point[0] >= x0 && point[0] <= x1 && point[1] >= y0 && point[1] <= y1;
    if (inside) run.push(point);
    else {
      if (run.length > 1) runs.push(run);
      run = [];
    }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

function polylineD(points, project) {
  return points
    .map((point, index) => {
      const [sx, sy] = project(point);
      return `${index ? "L" : "M"}${sx.toFixed(1)} ${sy.toFixed(1)}`;
    })
    .join("");
}

// The SVG fallback: nodal hyperbolas and crest circles, cast onto the paper.
// geometry: { x, inside: [x0, y0, x1, y1], lamp: [x, y, z], water, paper }.
export function patternOf(state, geometry, project, phase) {
  const { x: dipX, inside, lamp, water, paper } = geometry;
  const [x0, y0, x1, y1] = inside;
  const lam = state.wavelength;
  const c = state.d / 2;
  const toPaper = (runs) => runs.map((run) => polylineD(run.map((p) => castOnPaper(p, lamp, water, paper)), project)).join("");

  const nodalRuns = [];
  const reachX = Math.max(dipX - x0, x1 - dipX);
  for (const a of nodalVertices(state.d, lam)) {
    const half = Math.abs(a);
    const b = Math.sqrt(Math.max(c * c - half * half, 1e-6));
    const span = Math.asinh(reachX / b) + 0.05;
    const steps = 72;
    const points = [];
    for (let step = 0; step <= steps; step++) {
      const t = -span + (2 * span * step) / steps;
      // Hyperbola with foci on the y axis through the dippers: y along the dipper line, x across it.
      points.push([dipX + b * Math.sinh(t), Math.sign(a) * half * Math.cosh(t)]);
    }
    nodalRuns.push(...clipRuns(points, inside));
  }

  const crestRuns = [];
  const fraction = (((phase / TWO_PI) % 1) + 1) % 1;
  const far = Math.max(...[[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([px, py]) => Math.hypot(px - dipX, py) + c));
  for (const sy of [-c, c]) {
    for (let r = lam * (1 + fraction); r <= far; r += lam) {
      const steps = Math.max(24, Math.ceil((TWO_PI * r) / 3));
      const ring = [];
      for (let step = 0; step <= steps; step++) {
        const angle = (TWO_PI * step) / steps;
        ring.push([dipX + r * Math.cos(angle), sy + r * Math.sin(angle)]);
      }
      crestRuns.push(...clipRuns(ring, inside));
    }
  }
  return { nodal: toPaper(nodalRuns), crests: toPaper(crestRuns) };
}
