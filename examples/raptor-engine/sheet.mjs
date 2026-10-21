// Print spec for scripts/print.mjs: Raptor 2 explained on A4, from the built light page.
const select = (id) => `.it[data-piece="${id}"]`;
const FRONT_ONLY = { layers: [1], hide: ["stand"] };

export default {
  page: "raptor-engine-light.html",
  out: "raptor-engine",
  layers: ".rp-stage > svg.rp-back, .rp-stage > svg.rp-front",
  rasterSelector: ".rp-stage",
  strip: [".rp-deckglow"],
  views: {
    rest: {},
    apart: { actions: [["key", " "], ["wait", 2500]], reset: [["key", " "], ["wait", 2500]] },
    firing: { actions: [["key", "i"], ["wait", 3500]], raster: { region: [170, 300, 560, 560] }, reset: [["key", "Escape"], ["wait", 2500]] },
  },

  name: "Raptor 2",
  title: "Raptor 2: how a rocket engine works",
  number: "CW-001",
  tagline: "Full-flow staged combustion",
  question: "How does a rocket engine work?",
  lead: "Two liquids colder than −160 °C are pumped up to 300 bar. A small share of each burns in its own preburner, and those hot gases spin the pumps. Then both gases meet in the main chamber, and the bell turns their pressure into 230 tonnes of thrust.",
  quote: "Nothing reaches the main chamber without first driving a turbine.",
  numbers: [
    ["230", "tf", "thrust at sea level"],
    ["300", "bar", "main chamber pressure"],
    ["3.6", ": 1", "oxygen to methane, by mass"],
    ["1,630", "kg", "dry mass"],
    ["1.3", "m", "nozzle exit"],
  ],
  spec: [
    ["Cycle", "Full-flow staged combustion"],
    ["Propellants", "LOX / methane"],
    ["Mixture", "3.6 : 1"],
    ["Chamber", "300 bar"],
    ["Thrust", "230 tf, sea level"],
    ["Exit", "1.3 m"],
    ["Dry mass", "1,630 kg"],
  ],
  why: {
    title: "Why full flow?",
    text: "Most engines send only part of their propellant through the turbines. Raptor sends all of it, so each turbine makes the same power while running cooler, and both gases reach the main chamber already hot enough to light each other: the chamber needs no igniter.",
  },
  parts: [
    { id: "gimbal", name: "Gimbal and thrust puck", say: "Hands the thrust to the stand and lets the engine steer.", select: select("gimbal") },
    { id: "otp", name: "Oxygen turbopump", say: "Raises the liquid oxygen to chamber pressure and beyond.", select: select("otp") },
    { id: "orpb", name: "Oxygen-rich preburner", say: "Burns a trace of methane in all the oxygen to drive the oxygen pump.", select: select("orpb") },
    { id: "lox", name: "Oxygen duct and main valve", say: "Carries the pumped oxygen to its preburner; the valve meters it.", select: select("lox") },
    { id: "controller", name: "Engine controller and harness", say: "Times the valves and igniters and reads the pump speed.", select: select("controller"), at: [387, 384] },
    { id: "chamber", name: "Injector and main chamber", say: "Where the two hot gases meet and burn at 300 bar.", select: select("chamber") },
    { id: "hotgas", name: "Hot-gas manifold", say: "Takes the fuel-rich turbine exhaust into the injector.", select: select("hotgas") },
    { id: "ftp", name: "Methane turbopump and fuel-rich preburner", say: "Raises the methane, driven by burning a little oxygen in all of it.", select: select("ftp") },
    { id: "downcomer", name: "Downcomer and main fuel valve", say: "Sends pumped methane down to cool the nozzle first.", select: select("downcomer"), at: [516, 470] },
    { id: "plumbing", name: "Plumbing", say: "Sense, purge, igniter and pressurisation lines between the parts.", select: select("plumbing"), at: [396, 84] },
    { id: "nozzle", name: "Nozzle", say: "A methane-cooled bell that turns pressure into speed.", select: select("nozzle") },
    { id: "stand", select: select("stand") },
  ],
  main: { view: "apart", crop: [286, 30, 464, 706], ...FRONT_ONLY },
  inset: { label: "Assembled", view: "rest", crop: [36, 14, 828, 962] },
  steps: [
    { view: "apart", ...FRONT_ONLY, title: "Pumps raise the pressure", text: "Liquid oxygen at −183 °C enters the oxygen pump on the engine's axis, under the gimbal. Methane at −162 °C enters the methane pump hung alongside. Both leave far above chamber pressure.", focus: ["otp", "ftp"] },
    { view: "apart", ...FRONT_ONLY, title: "Methane cools the bell", text: "The pumped methane runs down the downcomer to the manifold round the nozzle and climbs back through the walls of the bell and chamber, carrying off their heat before it burns.", focus: ["downcomer", "nozzle"] },
    { view: "apart", ...FRONT_ONLY, title: "Preburners spin the pumps", text: "All the oxygen burns with a trace of methane in the oxygen-rich preburner, and all the methane with a trace of oxygen in the fuel-rich one. Each hot gas drives its own pump's turbine.", focus: ["orpb", "ftp"] },
    { view: "apart", ...FRONT_ONLY, title: "Hot gases meet", text: "The two turbine exhausts enter the injector together and meet in the main chamber at 300 bar. Both are already hot, so they light each other and the chamber has no igniter.", focus: ["chamber", "hotgas"] },
    { view: "firing", title: "Thrust", text: "The bell expands the gas to supersonic speed. The exhaust leaves at the exit plane, and the load cell above the gimbal reads about 230 tf pushing up into the stand." },
  ],
  assemblies: [
    { title: "Oxygen side", text: "The oxygen pump, its preburner and the duct between them: all the oxygen passes through the turbine before it burns.", parts: ["otp", "orpb", "lox"] },
    { title: "Methane side", text: "The methane pump with its fuel-rich preburner, the downcomer to the nozzle and the hot-gas manifold into the injector.", parts: ["ftp", "downcomer", "hotgas"] },
    { title: "Chamber and nozzle", text: "The injector and main chamber, cooled through its jacket, and the bell nozzle with its cooling manifold.", parts: ["chamber", "nozzle"] },
    { title: "Mount and controls", text: "The gimbal that carries the thrust, the controller and harness, and the small lines that sense, purge and pressurise.", parts: ["gimbal", "controller", "plumbing"] },
  ],
  details: [
    { title: "Oxygen turbopump", text: "The volute wraps the housing and ends in the outlet flange the oxygen duct bolts to.", around: ["otp"], focus: ["otp"] },
    { title: "Methane side", text: "The methane pump hangs on three struts and feeds the downcomer.", around: ["ftp"], focus: ["ftp"] },
    { title: "Engine controller", text: "Six connectors feed the harness that climbs the chamber in clamps.", around: ["controller"], focus: ["controller"] },
  ],
};
