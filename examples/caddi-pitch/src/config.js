import * as THREE from 'three';

const LIGHT = {
  paper: '#F4F6F9',
  sheet: '#FBFCFD',
  panel: '#FFFFFF',
  ink: '#0F172A',
  hatch: '#0F172A',
  shadow: '#0F172A',
  slate: '#64748B',
  red: '#E60012',
  redHot: '#FF2A2A',
  blue: '#0052FF',
  amber: '#F59E0B',
  emerald: '#10B981',
  emeraldInk: '#047857',
  amberInk: '#B45309',
  slateInk: '#475569',
  cyan: '#22D3EE',
  clay: '#D7DCE4',
  aluminium: '#C9CED6',
  stainless: '#B4BAC3',
  steel: '#9AA1AB',
  blackOxide: '#2B2F36',
};

const DARK = {
  ...LIGHT,
  paper: '#0B1220',
  sheet: '#0E1A30',
  panel: '#111B2E',
  ink: '#E2E8F0',
  hatch: '#020617',
  shadow: '#000000',
  slate: '#94A3B8',
  red: '#FF3B4A',
  redHot: '#FF5A64',
  blue: '#5B8CFF',
  amber: '#FBBF24',
  emerald: '#34D399',
  emeraldInk: '#34D399',
  amberInk: '#FBBF24',
  slateInk: '#94A3B8',
  clay: '#4A5568',
};

export const THEME = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
export const PALETTE = THEME === 'dark' ? DARK : LIGHT;

export const MM = 40;

export const BOM = [
  { id: 'manifold', balloon: { r: 2.2, h: 1.0 }, item: 1, name: 'BASE MANIFOLD BLOCK', pn: 'CD-8841-01', mat: 'AL6061-T6', qty: 1, compact: 0, exploded: 0,
    supplier: 'Meikoh Precision', cost: 38.6, lead: '12d', tol: 'ISO 2768-m · flatness 0.02', finish: 'Ra 1.6 milled' },
  { id: 'housing', balloon: { r: 1.7, h: 1.2 }, item: 2, name: 'MACHINED FLANGE HOUSING', pn: 'CD-8841-02', mat: 'SUS304', qty: 1, compact: 1.4, exploded: 2.6,
    supplier: 'Meikoh Precision', cost: 21.5, lead: '12d', tol: 'Ø48.00 H7 ±0.01 · ⌖0.02 A|B', finish: 'Ra 0.8 bore' },
  { id: 'bolts', balloon: { r: 1.3, h: 0.1 }, item: 3, name: 'HEX SOCKET BOLT M6×1.0×24', pn: 'ISO 4762-M6', mat: 'SCM435 black oxide', qty: 4, compact: 1.65, exploded: 3.65,
    supplier: 'Tokyo Fastener', cost: 0.18, lead: '3d', tol: '6g thread', finish: 'black oxide' },
  { id: 'bearing', balloon: { r: 0.9, h: 0.2 }, item: 4, name: 'DEEP GROOVE BEARING 6206-2RS', pn: 'BRG-6206', mat: 'SUJ2', qty: 1, compact: 2.8, exploded: 5.2,
    supplier: 'NSK (catalog)', cost: 6.4, lead: '5d', tol: 'P6 · Ø62 × Ø30 × 16', finish: 'ground' },
  { id: 'flange', balloon: { r: 1.35, h: 0.15 }, item: 5, name: 'SLOTTED ROTOR FLANGE', pn: 'CD-8841-05', mat: 'S45C', qty: 1, compact: 3.22, exploded: 6.35,
    supplier: 'Kansai Kogyo', cost: 9.8, lead: '9d', tol: '6× slot 8.0 ±0.05', finish: 'Ra 3.2' },
  { id: 'shaft', balloon: { r: 0.45, h: 2.4 }, item: 6, name: 'ACTUATOR SHAFT Ø30 h6', pn: 'CD-8841-06', mat: 'SUS420J2', qty: 1, compact: 0.7, exploded: 7.7,
    supplier: 'Meikoh Precision', cost: 7.2, lead: '10d', tol: 'Ø30 h6 · keyway 8 N9', finish: 'Ra 0.4 ground' },
];

export const STAGES = [
  { id: 'ingest', code: '01', label: 'DATA LAYER: OCR & INGEST', start: 0, hold: 9.4, end: 10.4 },
  { id: 'explorer', code: '02', label: 'EXPLORER: SHAPE SIMILARITY', start: 10.4, hold: 17.2, end: 19.4 },
  { id: 'datamap', code: '03', label: 'SEMANTIC DATA MAP', start: 19.4, hold: 26.4, end: 27.6 },
  { id: 'composer', code: '04', label: 'WORKFLOWS & QCD ROI', start: 27.6, hold: 31.4, end: 36 },
];
export const LOOP = 36;

const v = (x, y, z) => new THREE.Vector3(x, y, z);
export const FOCUS = {
  sheet: { target: v(0, 0.6, 0), zoom: 1.05 },
  rise: { target: v(0, 1.9, 0), zoom: 1.45 },
  exploded: { target: v(0, 4.6, 0), zoom: 1.0 },
  split: { target: v(0, 3.4, 0), zoom: 1.6 },
  datamap: { target: v(0.6, 2.6, -0.6), zoom: 0.82 },
  composer: { target: v(-0.9, 2.0, 1.6), zoom: 0.9 },
};
