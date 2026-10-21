import * as THREE from 'three';
import { PALETTE } from './config.js';

export const GLOBAL = {
  uScanY: { value: 99 },
  uTime: { value: 0 },
  uLightView: { value: new THREE.Vector3(0, 1, 0) },
  uPixelRatio: { value: 1 },
  uInk: { value: new THREE.Color(PALETTE.ink) },
  uHatch: { value: new THREE.Color(PALETTE.hatch) },
  uScanColor: { value: new THREE.Color(PALETTE.cyan) },
  uClayColor: { value: new THREE.Color(PALETTE.clay) },
  uHotColor: { value: new THREE.Color(PALETTE.red) },
};

const ENCODE = '#include <colorspace_fragment>';

const HEATMAP = `
  vec3 heatColor(float h) {
    vec3 c0 = vec3(0.10, 0.36, 0.95);
    vec3 c1 = vec3(0.13, 0.83, 0.93);
    vec3 c2 = vec3(0.96, 0.62, 0.04);
    vec3 c3 = vec3(0.90, 0.0, 0.07);
    vec3 c = h < 0.33 ? mix(c0, c1, h / 0.33) : h < 0.66 ? mix(c1, c2, (h - 0.33) / 0.33) : mix(c2, c3, (h - 0.66) / 0.34);
    return pow(c, vec3(2.2));
  }
`;

const HATCH = `
  float hatchLine(vec2 p, float spacing, float width) {
    float d = abs(fract(p.x / spacing) - 0.5) * spacing;
    return 1.0 - smoothstep(width * 0.5, width * 0.5 + 0.9, d);
  }
  float stipple(vec2 p, float density) {
    vec2 cell = floor(p / 3.0);
    float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
    vec2 f = fract(p / 3.0) - 0.5;
    return step(h, density) * (1.0 - smoothstep(0.18, 0.32, length(f)));
  }
  float technicalShade(float shade, vec2 fragPx, float pr) {
    vec2 p = fragPx / pr;
    vec2 a = vec2(p.x + p.y, p.x - p.y) * 0.7071;
    float ink = stipple(p, smoothstep(0.18, 0.42, shade) * 0.55) * (1.0 - step(0.42, shade));
    ink = max(ink, hatchLine(a, 4.5, 0.8) * smoothstep(0.38, 0.46, shade));
    ink = max(ink, hatchLine(a.yx, 4.5, 0.8) * smoothstep(0.66, 0.74, shade));
    return ink;
  }
`;

export function patchPartMaterial(material, u) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, GLOBAL, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float heat;\nvarying float vHeat;\nvarying vec3 vWorldP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvHeat = heat;\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vHeat; varying vec3 vWorldP;
        uniform float uScanY; uniform float uTime; uniform vec3 uLightView; uniform float uPixelRatio;
        uniform vec3 uInk; uniform vec3 uHatch; uniform vec3 uScanColor; uniform vec3 uClayColor; uniform vec3 uHotColor;
        uniform float uHeat; uniform float uClay; uniform float uGhost; uniform float uHighlight;
        ${HEATMAP}
        ${HATCH}
        float bayer4(vec2 p) {
          vec2 q = mod(floor(p), 4.0);
          int i = int(q.x) + int(q.y) * 4;
          int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
          return (float(m[i]) + 0.5) / 16.0;
        }`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (vWorldP.y < uScanY) discard;
        if (uGhost > 0.0 && bayer4(gl_FragCoord.xy) < uGhost * 0.94) discard;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        vec3 col = gl_FragColor.rgb;
        float lit = dot(normal, normalize(uLightView));
        if (uHeat > 0.001) {
          float hv = clamp(vHeat + 0.04 * sin(uTime * 2.0 + vWorldP.y * 6.0) * step(0.6, vHeat), 0.0, 1.0);
          float lum = dot(col, vec3(0.299, 0.587, 0.114));
          float contour = 1.0 - smoothstep(0.0, 0.03, abs(fract(hv * 6.0) - 0.5) - 0.44);
          col = mix(col, heatColor(hv) * (0.55 + 0.9 * lum), uHeat * 0.85);
          col = mix(col, uHatch, contour * uHeat * 0.25);
        }
        col = mix(col, uClayColor * (0.7 + 0.35 * lit), uClay);
        float shade = 1.0 - clamp(lit * 0.5 + 0.5, 0.0, 1.0);
        float ink = technicalShade(shade * (1.0 - uHeat * 0.5), gl_FragCoord.xy, uPixelRatio);
        col = mix(col, uHatch, ink * 0.42 * (1.0 - uClay * 0.6));
        col = mix(col, uScanColor * 1.6, exp(-abs(vWorldP.y - uScanY) * 28.0) * 0.9);
        col = mix(col, uHotColor, uHighlight * 0.18);
        gl_FragColor = vec4(col, mix(gl_FragColor.a, 0.42, uClay));`,
      );
  };
  material.customProgramCacheKey = () => 'cad-part';
}

export const edgeShader = {
  vertexShader: `
    varying vec3 vWorldP;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldP = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: `
    uniform float uScanY;
    uniform vec3 uRaw;
    uniform vec3 uDone;
    uniform vec3 uHot;
    uniform float uHighlight;
    uniform float uOpacity;
    varying vec3 vWorldP;
    void main() {
      vec3 c = mix(uDone, uRaw, step(vWorldP.y, uScanY));
      gl_FragColor = vec4(mix(c, uHot, uHighlight), uOpacity);
      ${ENCODE}
    }
  `,
};

export const pointShader = {
  vertexShader: `
    attribute float aRand;
    uniform float uScanY;
    uniform float uTime;
    uniform float uPixelRatio;
    uniform float uOpacity;
    varying float vAlpha;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      float raw = 1.0 - smoothstep(uScanY - 0.08, uScanY + 0.02, wp.y);
      vAlpha = raw * uOpacity * (0.55 + 0.45 * sin(uTime * 4.0 + aRand * 30.0));
      gl_PointSize = (1.4 + aRand * 1.4) * uPixelRatio;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    varying float vAlpha;
    void main() {
      if (vAlpha < 0.02 || length(gl_PointCoord - 0.5) > 0.5) discard;
      gl_FragColor = vec4(uColor, vAlpha);
      ${ENCODE}
    }
  `,
};

const uvVert = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const scannerShader = {
  vertexShader: uvVert,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uTime;
    uniform float uOpacity;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv * 2.0 - 1.0;
      float edge = max(abs(p.x), abs(p.y));
      float frame = smoothstep(0.965, 0.985, edge) * (1.0 - smoothstep(0.995, 1.0, edge));
      vec2 g = abs(fract(vUv * 24.0) - 0.5);
      float grid = (1.0 - smoothstep(0.0, 0.04, min(g.x, g.y))) * 0.25;
      float sweep = exp(-abs(fract(vUv.x - uTime * 0.35) - 0.5) * 30.0) * 0.5;
      float corner = step(0.86, abs(p.x)) * step(0.86, abs(p.y)) * frame * 2.0;
      float a = 0.08 + grid + sweep * 0.4 + frame + corner;
      gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0) * uOpacity);
      ${ENCODE}
    }
  `,
};

export const gridShader = {
  vertexShader: edgeShader.vertexShader,
  fragmentShader: `
    uniform vec3 uInk;
    uniform vec3 uCenter;
    varying vec3 vWorldP;
    float gridLine(vec2 p, float step) {
      vec2 g = abs(fract(p / step - 0.5) - 0.5) / fwidth(p / step);
      return 1.0 - min(min(g.x, g.y), 1.0);
    }
    void main() {
      vec2 p = vWorldP.xz;
      float fine = gridLine(p, 0.25) * 0.05;
      float mid = gridLine(p, 1.0) * 0.12;
      float major = gridLine(p, 5.0) * 0.22;
      float fade = 1.0 - smoothstep(14.0, 30.0, length(p - uCenter.xz));
      gl_FragColor = vec4(uInk, max(max(fine, mid), major) * fade);
      ${ENCODE}
    }
  `,
};

export const sectionShader = {
  vertexShader: `
    varying vec3 vLocal;
    void main() {
      vLocal = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uHatch;
    uniform vec3 uBase;
    varying vec3 vLocal;
    void main() {
      float h = abs(fract((vLocal.z + vLocal.y) * 9.0) - 0.5);
      float hatch = 1.0 - smoothstep(0.1, 0.16, h);
      gl_FragColor = vec4(mix(uBase, uHatch, hatch * 0.9), 1.0);
      ${ENCODE}
    }
  `,
};

export const sheetShader = {
  vertexShader: uvVert,
  fragmentShader: `
    uniform sampler2D uMap;
    uniform float uReveal;
    uniform vec3 uPaper;
    uniform vec3 uScan;
    varying vec2 vUv;
    void main() {
      vec3 tex = texture2D(uMap, vUv).rgb;
      float front = uReveal * 1.6 - 0.3;
      float d = (vUv.x * 0.6 + (1.0 - vUv.y) * 0.4) - front;
      float shown = 1.0 - smoothstep(-0.01, 0.0, d);
      float glow = exp(-abs(d) * 60.0) * step(uReveal, 0.999);
      vec3 col = mix(mix(uPaper, tex, shown), uScan, glow * 0.8);
      gl_FragColor = vec4(col, 1.0);
      ${ENCODE}
    }
  `,
};

export const linkShader = {
  vertexShader: `
    varying float vS;
    varying vec3 vViewN;
    void main() {
      vS = uv.x;
      vViewN = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uProgress;
    uniform float uTail;
    uniform vec3 uColor;
    uniform float uTime;
    uniform float uGlow;
    varying float vS;
    varying vec3 vViewN;
    void main() {
      if (vS > uProgress || vS < uTail) discard;
      float facing = abs(vViewN.z);
      float head = exp(-(uProgress - vS) * 40.0);
      if (uGlow > 0.5) {
        float pulse = 0.55 + 0.45 * sin(vS * 50.0 - uTime * 8.0);
        gl_FragColor = vec4(uColor, pow(facing, 2.0) * (0.22 * pulse + head * 0.4));
      } else {
        vec3 col = uColor * (0.75 + 0.35 * facing);
        gl_FragColor = vec4(mix(col, vec3(1.0), head * 0.7), 1.0);
      }
      ${ENCODE}
    }
  `,
};

export function patchHatchShadow(material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uPixelRatio: GLOBAL.uPixelRatio });
    shader.fragmentShader = shader.fragmentShader
      .replace('uniform float opacity;', 'uniform float opacity;\nuniform float uPixelRatio;')
      .replace(
        'gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );',
        `float sh = 1.0 - getShadowMask();
        vec2 p = gl_FragCoord.xy / uPixelRatio;
        float lineA = 1.0 - smoothstep(0.35, 1.25, abs(fract((p.x - p.y) * 0.7071 / 4.0) - 0.5) * 4.0);
        float lineB = (1.0 - smoothstep(0.35, 1.25, abs(fract((p.x + p.y) * 0.7071 / 4.0) - 0.5) * 4.0)) * step(0.7, sh);
        gl_FragColor = vec4(color, opacity * max(lineA, lineB) * smoothstep(0.05, 0.3, sh));`,
      );
  };
}

export function assertChunks() {
  const frag = THREE.ShaderLib.physical.fragmentShader;
  const vert = THREE.ShaderLib.physical.vertexShader;
  const shadow = THREE.ShaderLib.shadow.fragmentShader;
  const missing = [
    ['#include <common>', frag], ['#include <clipping_planes_fragment>', frag], ['#include <opaque_fragment>', frag],
    ['#include <worldpos_vertex>', vert], ['gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );', shadow],
  ].filter(([needle, src]) => !src.includes(needle));
  missing.forEach(([needle]) => console.warn(`[shaders] patch target missing in this three.js build: ${needle}`));
}
