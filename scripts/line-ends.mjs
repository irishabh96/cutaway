// The line-end check. LINE_ENDS is the source of one self-contained function that runs inside a page:
//   (${LINE_ENDS})({ select, tolerance, root, mark, least, cover, show })
// It returns { ends, lines, problems } for the open subpaths of every checked .iso-line in the target.

function lineEnds(options) {
  const o = Object.assign({ select: null, tolerance: 1, root: 2, mark: 7, least: 0.3, cover: 0.5, show: false }, options || {});
  let target;
  if (o.select === null || o.select === undefined) {
    target = document.querySelector(".iso-plate") || document.body;
  } else {
    try {
      target = document.querySelector(o.select);
    } catch (error) {
      target = null;
    }
    if (!target) throw new Error("Line target not found: " + o.select);
  }

  const SHAPE_TAGS = new Set(["path", "line", "polyline", "polygon", "circle", "ellipse", "rect"]);
  const NOT_DRAWN = new Set(["defs", "clippath", "mask", "pattern", "marker", "symbol"]);
  const OUTLINES = ["iso-edge", "iso-bevel", "iso-crease", "tb-edge"];
  const FLAT = 0.15;
  const SPLITS = 16384;
  const CELL = 24;

  // ---- which elements are in scope ----
  const svgs = target.localName === "svg" ? [target, ...target.querySelectorAll("svg")] : [...target.querySelectorAll("svg")];
  const inScope = new Set();
  const drawn = (el) => {
    for (let node = el.parentNode; node && node.nodeType === 1; node = node.parentNode)
      if (NOT_DRAWN.has(node.localName.toLowerCase())) return false;
    return true;
  };
  for (const svg of svgs)
    for (const el of svg.querySelectorAll("path,line,polyline,polygon,circle,ellipse,rect"))
      if (!inScope.has(el) && drawn(el)) inScope.add(el);

  const chainCache = new Map();
  const chain = (node) => {
    if (chainCache.has(node)) return chainCache.get(node);
    const style = getComputedStyle(node);
    let value = style.display === "none" ? 0 : parseFloat(style.opacity);
    if (!Number.isFinite(value)) value = 1;
    if (value > 0 && node !== target && node.parentElement) value *= chain(node.parentElement);
    chainCache.set(node, value);
    return value;
  };
  const scaleCache = new Map();
  const scaleOf = (svg) => {
    if (!svg) return 1;
    if (scaleCache.has(svg)) return scaleCache.get(svg);
    const m = svg.getScreenCTM();
    const value = m ? Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1 : 1;
    scaleCache.set(svg, value);
    return value;
  };

  // ---- geometry helpers (screen space) ----
  const apply = (m, x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
  const stretch = (m) => {
    const t = m.a * m.a + m.b * m.b + m.c * m.c + m.d * m.d;
    const det = m.a * m.d - m.b * m.c;
    return Math.sqrt((t + Math.sqrt(Math.max(0, t * t - 4 * det * det))) / 2) || 1;
  };
  const stepsFor = (radius, sweep) => {
    const delta = radius > FLAT ? 2 * Math.acos(1 - FLAT / radius) : Math.PI / 2;
    return Math.min(20000, Math.max(8, Math.ceil(Math.abs(sweep) / delta)));
  };
  const segDistance = (p, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const span = dx * dx + dy * dy;
    let t = span ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / span : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

  // Adds a cubic to pts (without its first point), flattened to within FLAT of the true curve.
  const cubic = (pts, p0, p1, p2, p3) => {
    const stack = [[p0, p1, p2, p3]];
    let splits = 0;
    while (stack.length) {
      const c = stack.pop();
      if (segDistance(c[1], c[0], c[3]) <= FLAT && segDistance(c[2], c[0], c[3]) <= FLAT) {
        pts.push(c[3]);
        continue;
      }
      if (++splits > SPLITS || !c.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])))
        throw new Error("Curve audit could not establish its screen-space sampling bound");
      const a = mid(c[0], c[1]);
      const b = mid(c[1], c[2]);
      const e = mid(c[2], c[3]);
      const ab = mid(a, b);
      const be = mid(b, e);
      const centre = mid(ab, be);
      stack.push([centre, be, e, c[3]], [c[0], a, ab, centre]);
    }
  };

  // Samples an SVG elliptical arc (endpoint form) in local units and maps it to the screen.
  const arc = (pts, m, from, seg) => {
    const [x1, y1] = from;
    const [x2, y2] = seg.p;
    let rx = Math.abs(seg.rx);
    let ry = Math.abs(seg.ry);
    if (x1 === x2 && y1 === y2) return;
    if (!rx || !ry) {
      pts.push(apply(m, x2, y2));
      return;
    }
    const phi = (seg.rot * Math.PI) / 180;
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    const hx = (x1 - x2) / 2;
    const hy = (y1 - y2) / 2;
    const xp = cos * hx + sin * hy;
    const yp = -sin * hx + cos * hy;
    const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
    if (lambda > 1) {
      rx *= Math.sqrt(lambda);
      ry *= Math.sqrt(lambda);
    }
    const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
    const den = rx * rx * yp * yp + ry * ry * xp * xp;
    const k = (seg.large === seg.sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
    const cxp = (k * rx * yp) / ry;
    const cyp = (-k * ry * xp) / rx;
    const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
    const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
    const angle = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const theta = angle(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
    let sweep = angle((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
    if (!seg.sweep && sweep > 0) sweep -= 2 * Math.PI;
    if (seg.sweep && sweep < 0) sweep += 2 * Math.PI;
    const n = stepsFor(Math.max(rx, ry) * stretch(m), sweep);
    for (let i = 1; i < n; i++) {
      const t = theta + (sweep * i) / n;
      pts.push(apply(m, cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos));
    }
    pts.push(apply(m, x2, y2));
  };

  // Parses path data into subpaths of local segments: { start, segs, closed }.
  const parsePath = (d) => {
    const subs = [];
    let i = 0;
    const skip = () => {
      while (i < d.length && (d[i] === "," || d[i] === " " || d[i] === "\t" || d[i] === "\n" || d[i] === "\r" || d[i] === "\f")) i++;
    };
    const numberPattern = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
    const num = () => {
      skip();
      numberPattern.lastIndex = i;
      const found = numberPattern.exec(d);
      if (!found) return null;
      i = numberPattern.lastIndex;
      return parseFloat(found[0]);
    };
    const flag = () => {
      skip();
      if (d[i] === "0" || d[i] === "1") return d[i++] === "1";
      return null;
    };
    const numbers = (count) => {
      const out = [];
      for (let n = 0; n < count; n++) {
        const value = num();
        if (value === null) return null;
        out.push(value);
      }
      return out;
    };
    let cur = [0, 0];
    let start = [0, 0];
    let sub = null;
    let command = "";
    let lastCubic = null;
    let lastQuad = null;
    const open = () => {
      if (!sub) {
        sub = { start: cur.slice(), segs: [], closed: false };
        subs.push(sub);
      }
    };
    for (;;) {
      skip();
      if (i >= d.length) break;
      if (/[a-zA-Z]/.test(d[i])) command = d[i++];
      else if (!command || command === "z" || command === "Z") break;
      else if (command === "M") command = "L";
      else if (command === "m") command = "l";
      const rel = command === command.toLowerCase();
      const upper = command.toUpperCase();
      const ox = rel ? cur[0] : 0;
      const oy = rel ? cur[1] : 0;
      let cubicCtrl = null;
      let quadCtrl = null;
      if (upper === "Z") {
        if (sub) {
          if (cur[0] !== sub.start[0] || cur[1] !== sub.start[1]) sub.segs.push({ k: "L", p: sub.start.slice() });
          sub.closed = true;
          cur = sub.start.slice();
          sub = null;
        }
      } else if (upper === "M") {
        const v = numbers(2);
        if (!v) break;
        cur = [ox + v[0], oy + v[1]];
        start = cur.slice();
        sub = { start: start.slice(), segs: [], closed: false };
        subs.push(sub);
      } else if (upper === "L" || upper === "H" || upper === "V") {
        const v = numbers(upper === "L" ? 2 : 1);
        if (!v) break;
        open();
        const p = upper === "L" ? [ox + v[0], oy + v[1]] : upper === "H" ? [ox + v[0], cur[1]] : [cur[0], oy + v[0]];
        sub.segs.push({ k: "L", p });
        cur = p;
      } else if (upper === "C" || upper === "S") {
        const v = numbers(upper === "C" ? 6 : 4);
        if (!v) break;
        open();
        let c1;
        let rest = v;
        if (upper === "C") {
          c1 = [ox + v[0], oy + v[1]];
          rest = v.slice(2);
        } else c1 = lastCubic ? [2 * cur[0] - lastCubic[0], 2 * cur[1] - lastCubic[1]] : cur.slice();
        const c2 = [ox + rest[0], oy + rest[1]];
        const p = [ox + rest[2], oy + rest[3]];
        sub.segs.push({ k: "C", c1, c2, p });
        cubicCtrl = c2;
        cur = p;
      } else if (upper === "Q" || upper === "T") {
        const v = numbers(upper === "Q" ? 4 : 2);
        if (!v) break;
        open();
        let q;
        let p;
        if (upper === "Q") {
          q = [ox + v[0], oy + v[1]];
          p = [ox + v[2], oy + v[3]];
        } else {
          q = lastQuad ? [2 * cur[0] - lastQuad[0], 2 * cur[1] - lastQuad[1]] : cur.slice();
          p = [ox + v[0], oy + v[1]];
        }
        const c1 = [cur[0] + (2 / 3) * (q[0] - cur[0]), cur[1] + (2 / 3) * (q[1] - cur[1])];
        const c2 = [p[0] + (2 / 3) * (q[0] - p[0]), p[1] + (2 / 3) * (q[1] - p[1])];
        sub.segs.push({ k: "C", c1, c2, p });
        quadCtrl = q;
        cur = p;
      } else if (upper === "A") {
        const radii = numbers(3);
        if (!radii) break;
        const large = flag();
        const sweep = flag();
        const end = numbers(2);
        if (large === null || sweep === null || !end) break;
        open();
        const p = [ox + end[0], oy + end[1]];
        sub.segs.push({ k: "A", rx: radii[0], ry: radii[1], rot: radii[2], large, sweep, p });
        cur = p;
      } else break;
      lastCubic = cubicCtrl;
      lastQuad = quadCtrl;
    }
    return subs;
  };

  const flattenPath = (el, m) =>
    parsePath(el.getAttribute("d") || "").map((sub) => {
      const pts = [apply(m, sub.start[0], sub.start[1])];
      let from = sub.start;
      for (const seg of sub.segs) {
        if (seg.k === "L") pts.push(apply(m, seg.p[0], seg.p[1]));
        else if (seg.k === "C") cubic(pts, pts[pts.length - 1], apply(m, seg.c1[0], seg.c1[1]), apply(m, seg.c2[0], seg.c2[1]), apply(m, seg.p[0], seg.p[1]));
        else arc(pts, m, from, seg);
        from = seg.p;
      }
      return { pts, closed: sub.closed };
    });

  const ellipsePoints = (m, cx, cy, rx, ry, from, sweep, count) => {
    const pts = [];
    for (let i = 0; i <= count; i++) {
      const t = from + (sweep * i) / count;
      pts.push(apply(m, cx + rx * Math.cos(t), cy + ry * Math.sin(t)));
    }
    return pts;
  };

  const length = (el, name) => el[name].baseVal.value;
  const geometryOf = (el, m) => {
    const tag = el.localName;
    if (tag === "path") return flattenPath(el, m);
    if (tag === "line") return [{ pts: [apply(m, length(el, "x1"), length(el, "y1")), apply(m, length(el, "x2"), length(el, "y2"))], closed: false }];
    if (tag === "polyline" || tag === "polygon") {
      const list = el.points;
      const pts = Array.from({ length: list.numberOfItems }, (_, n) => list.getItem(n)).map((p) => apply(m, p.x, p.y));
      if (tag === "polygon" && pts.length) pts.push(pts[0]);
      return [{ pts, closed: tag === "polygon" }];
    }
    if (tag === "rect") {
      const x = length(el, "x");
      const y = length(el, "y");
      const w = length(el, "width");
      const h = length(el, "height");
      if (!(w > 0 && h > 0)) return [];
      let rx = el.hasAttribute("rx") ? length(el, "rx") : null;
      let ry = el.hasAttribute("ry") ? length(el, "ry") : null;
      if (rx === null) rx = ry;
      if (ry === null) ry = rx;
      rx = Math.min(Math.max(0, rx || 0), w / 2);
      ry = Math.min(Math.max(0, ry || 0), h / 2);
      if (!rx || !ry) {
        const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]].map(([px, py]) => apply(m, px, py));
        return [{ pts, closed: true }];
      }
      const n = stepsFor(Math.max(rx, ry) * stretch(m), Math.PI / 2) * 2;
      const q = Math.PI / 2;
      const pts = [
        ...ellipsePoints(m, x + w - rx, y + ry, rx, ry, -q, q, n),
        ...ellipsePoints(m, x + w - rx, y + h - ry, rx, ry, 0, q, n),
        ...ellipsePoints(m, x + rx, y + h - ry, rx, ry, q, q, n),
        ...ellipsePoints(m, x + rx, y + ry, rx, ry, 2 * q, q, n),
      ];
      pts.push(pts[0]);
      return [{ pts, closed: true }];
    }
    // circle and ellipse
    const cx = length(el, "cx");
    const cy = length(el, "cy");
    const rx = tag === "circle" ? length(el, "r") : length(el, "rx");
    const ry = tag === "circle" ? rx : length(el, "ry");
    if (!(rx > 0 && ry > 0)) return [];
    const n = Math.max(128, stepsFor(Math.max(rx, ry) * stretch(m), 2 * Math.PI));
    return [{ pts: ellipsePoints(m, cx, cy, rx, ry, 0, 2 * Math.PI, n), closed: true }];
  };

  // ---- collect shapes ----
  const shapes = [];
  for (const el of inScope) {
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.visibility === "collapse") continue;
    const opacity = chain(el);
    if (!(opacity >= 0.1)) continue;
    const m = el.getScreenCTM();
    if (!m) continue;
    const stroked = style.stroke !== "none" && parseFloat(style.strokeWidth) > 0 && parseFloat(style.strokeOpacity) > 0.05;
    const filled = style.fill !== "none" && parseFloat(style.fillOpacity) * opacity > 0.05;
    const round = el.localName === "circle" || el.localName === "ellipse";
    if (!stroked && !(round && filled)) continue;
    const classes = el.classList;
    const checked = stroked && classes.contains("iso-line") && !OUTLINES.some((name) => classes.contains(name)) && opacity >= o.least;
    const shape = { el, m, opacity, checked, subs: geometryOf(el, m), round: null };
    if (round && filled) {
      const tag = el.localName;
      const r = tag === "circle" ? length(el, "r") : 0;
      shape.round = {
        cx: length(el, "cx"),
        cy: length(el, "cy"),
        rx: tag === "circle" ? r : length(el, "rx"),
        ry: tag === "circle" ? r : length(el, "ry"),
        inverse: m.inverse(),
      };
    }
    shapes.push(shape);
  }

  // ---- spatial grids of obstacle segments and filled round shapes ----
  const segments = [];
  const grid = new Map();
  const rounds = new Map();
  const cellKey = (gx, gy) => gx + ":" + gy;
  const insert = (map, x0, y0, x1, y1, value) => {
    const gx0 = Math.floor(Math.min(x0, x1) / CELL);
    const gx1 = Math.floor(Math.max(x0, x1) / CELL);
    const gy0 = Math.floor(Math.min(y0, y1) / CELL);
    const gy1 = Math.floor(Math.max(y0, y1) / CELL);
    if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) > 250000) return;
    for (let gx = gx0; gx <= gx1; gx++)
      for (let gy = gy0; gy <= gy1; gy++) {
        const key = cellKey(gx, gy);
        const list = map.get(key);
        if (list) list.push(value);
        else map.set(key, [value]);
      }
  };
  shapes.forEach((shape, owner) => {
    shape.subs.forEach((sub, index) => {
      let along = 0;
      sub.cumulative = [0];
      for (let i = 1; i < sub.pts.length; i++) {
        const a = sub.pts[i - 1];
        const b = sub.pts[i];
        const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
        segments.push({ a, b, owner, sub: index, s0: along, s1: along + span });
        insert(grid, a[0], a[1], b[0], b[1], segments.length - 1);
        along += span;
        sub.cumulative.push(along);
      }
      sub.length = along;
    });
    if (shape.round) {
      const all = shape.subs[0] ? shape.subs[0].pts : [];
      if (all.length) {
        const xs = all.map((p) => p[0]);
        const ys = all.map((p) => p[1]);
        insert(rounds, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), owner);
      }
    }
  });

  let stamp = 0;
  const seen = new Int32Array(segments.length);
  // Distance from p to the nearest stroke within radius, leaving out the stretch [skipFrom, skipTo] of one subpath.
  const nearest = (p, radius, owner, subIndex, skipFrom, skipTo) => {
    stamp++;
    let best = Infinity;
    const gx0 = Math.floor((p[0] - radius) / CELL);
    const gx1 = Math.floor((p[0] + radius) / CELL);
    const gy0 = Math.floor((p[1] - radius) / CELL);
    const gy1 = Math.floor((p[1] + radius) / CELL);
    for (let gx = gx0; gx <= gx1; gx++)
      for (let gy = gy0; gy <= gy1; gy++) {
        const list = grid.get(cellKey(gx, gy));
        if (!list) continue;
        for (const index of list) {
          if (seen[index] === stamp) continue;
          seen[index] = stamp;
          const seg = segments[index];
          let a = seg.a;
          let b = seg.b;
          if (seg.owner === owner && seg.sub === subIndex) {
            if (seg.s0 >= skipFrom && seg.s1 <= skipTo) continue;
            const span = seg.s1 - seg.s0;
            const at = (s) => {
              const t = span ? (s - seg.s0) / span : 0;
              return [seg.a[0] + (seg.b[0] - seg.a[0]) * t, seg.a[1] + (seg.b[1] - seg.a[1]) * t];
            };
            if (seg.s0 < skipFrom && seg.s1 > skipFrom && seg.s1 <= skipTo) b = at(skipFrom);
            else if (seg.s0 >= skipFrom && seg.s0 < skipTo && seg.s1 > skipTo) a = at(skipTo);
            else if (seg.s0 < skipFrom && seg.s1 > skipTo) {
              best = Math.min(best, segDistance(p, a, at(skipFrom)), segDistance(p, at(skipTo), b));
              continue;
            }
          }
          const distance = segDistance(p, a, b);
          if (distance < best) best = distance;
        }
      }
    return best <= radius ? best : Infinity;
  };
  const insideRound = (p, owner) => {
    const list = rounds.get(cellKey(Math.floor(p[0] / CELL), Math.floor(p[1] / CELL)));
    if (!list) return false;
    for (const index of list) {
      if (index === owner) continue;
      const r = shapes[index].round;
      const [x, y] = apply(r.inverse, p[0], p[1]);
      const u = (x - r.cx) / r.rx;
      const v = (y - r.cy) / r.ry;
      if (u * u + v * v <= 1) return true;
    }
    return false;
  };

  // ---- hidden ends: under a fill painted above the line ----
  const scopeAttribute = "data-line-ends-scope";
  const hitStyle = document.createElement("style");
  hitStyle.textContent =
    "[" + scopeAttribute + "] *{pointer-events:none!important}" +
    "[" + scopeAttribute + "] svg,[" + scopeAttribute + "] svg *,svg[" + scopeAttribute + "],svg[" + scopeAttribute + "] *{pointer-events:visiblePainted!important}";
  const fillCache = new Map();
  const covers = (el) => {
    if (fillCache.has(el)) return fillCache.get(el);
    const style = getComputedStyle(el);
    const value = style.fill !== "none" && parseFloat(style.fillOpacity) * chain(el) >= o.cover;
    fillCache.set(el, value);
    return value;
  };
  const hidden = (line, p) => {
    const stack = document.elementsFromPoint(p[0], p[1]);
    const below = stack.indexOf(line);
    const above = below >= 0
      ? stack.slice(0, below)
      : stack.filter((el) => line.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    for (const el of above) {
      if (!SHAPE_TAGS.has(el.localName) || !inScope.has(el) || el.contains(line) || !covers(el)) continue;
      const m = el.getScreenCTM();
      if (!m) continue;
      const [x, y] = apply(m.inverse(), p[0], p[1]);
      if (el.isPointInFill(new DOMPoint(x, y))) return true;
    }
    return false;
  };

  // ---- check every open subpath of every checked line ----
  const nameOf = (el) => {
    for (let node = el.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      for (const attribute of ["data-part", "data-name", "data-item"]) if (node.hasAttribute(attribute)) return node.getAttribute(attribute);
      if (node.classList && node.classList.contains("it")) return "it k " + node.getAttribute("data-k");
      if (node === target) break;
    }
    return null;
  };
  const freeOf = (el) => {
    if (!el.hasAttribute("data-free")) return { start: false, end: false };
    const value = el.getAttribute("data-free");
    return { start: value === "" || value === "both" || value === "start", end: value === "" || value === "both" || value === "end" };
  };
  const box = target.getBoundingClientRect();
  const round = (value, step) => Math.round(value / step) * step;
  const tenth = (value) => Math.round(value * 10) / 10;
  const problems = [];
  const rings = [];
  let ends = 0;
  let lines = 0;
  target.setAttribute(scopeAttribute, "");
  (document.head || document.documentElement).appendChild(hitStyle);
  try {
    shapes.forEach((shape, owner) => {
      if (!shape.checked) return;
      lines++;
      const el = shape.el;
      const scale = scaleOf(el.ownerSVGElement || el.closest("svg"));
      const tol = o.tolerance * scale;
      const rootGap = o.root * scale;
      const reach = Math.max(tol, rootGap);
      const free = freeOf(el);
      shape.subs.forEach((sub, index) => {
        if (sub.closed || sub.pts.length < 2) return;
        const first = sub.pts[0];
        const last = sub.pts[sub.pts.length - 1];
        if (Math.hypot(last[0] - first[0], last[1] - first[1]) <= 0.05 * scale) return;
        if (sub.length < 0.2 * scale) return;
        const straight = sub.pts.length === 2 || sub.pts.every((p) => segDistance(p, first, last) <= FLAT * scale);
        const mark = straight && sub.length <= o.mark * scale;
        const probe = (which) => {
          const p = which === "start" ? first : last;
          const skipFrom = which === "start" ? -1 : sub.length - 2 * reach;
          const skipTo = which === "start" ? 2 * reach : sub.length + 1;
          if (insideRound(p, owner)) return { p, gap: 0 };
          let gap = nearest(p, 5 * reach, owner, index, skipFrom, skipTo);
          if (gap > (mark ? 0 : tol) && hidden(el, p)) gap = 0;
          return { p, gap };
        };
        const results = { start: probe("start"), end: probe("end") };
        const report = (which, isMark) => {
          const { p, gap } = results[which];
          problems.push({
            what: [el.getAttribute("class"), el.getAttribute("data-tone")].filter(Boolean).join(" ") + (nameOf(el) !== null ? " in " + nameOf(el) : ""),
            d: (el.getAttribute("d") || el.localName).slice(0, 36),
            end: which,
            mark: isMark,
            gap: Number.isFinite(gap) ? gap / scale : Infinity,
            at: [tenth(p[0] - box.left), tenth(p[1] - box.top)],
            opacity: round(shape.opacity, 0.01),
            length: tenth(sub.length / scale),
          });
          rings.push(p);
        };
        for (const which of ["start", "end"]) if (!free[which]) ends++;
        if (mark) {
          if (results.start.gap <= rootGap || results.end.gap <= rootGap) return;
          for (const which of ["start", "end"]) if (!free[which] && results[which].gap > 0) report(which, true);
        } else {
          for (const which of ["start", "end"]) if (!free[which] && results[which].gap > tol) report(which, false);
        }
      });
    });
  } finally {
    hitStyle.remove();
    target.removeAttribute(scopeAttribute);
  }

  problems.sort((a, b) => b.gap - a.gap);
  for (const problem of problems) {
    problem.opacity = Math.round(problem.opacity * 100) / 100;
    if (Number.isFinite(problem.gap)) problem.gap = Math.round(problem.gap * 1000) / 1000;
  }
  if (o.show) {
    const ns = "http://www.w3.org/2000/svg";
    const overlay = document.createElementNS(ns, "svg");
    overlay.setAttribute("data-line-ends", "");
    overlay.setAttribute("style", "position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647;overflow:visible");
    for (const [x, y] of rings) {
      const ring = document.createElementNS(ns, "circle");
      ring.setAttribute("cx", x);
      ring.setAttribute("cy", y);
      ring.setAttribute("r", 5);
      ring.setAttribute("fill", "none");
      ring.setAttribute("stroke", "#ff1a1a");
      ring.setAttribute("stroke-width", 1.5);
      overlay.appendChild(ring);
    }
    document.body.appendChild(overlay);
  }
  return { ends, lines, problems };
}

export const LINE_ENDS = lineEnds.toString();
