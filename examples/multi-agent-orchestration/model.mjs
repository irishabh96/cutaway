export function createModel(parallelism = 3) {
  return { time: 0, parallelism };
}

export function advance(state, dt) {
  if (!Number.isFinite(dt) || dt < 0) throw new Error("dt must be finite and non-negative");
  state.time += dt;
  return state;
}

export function setParameter(state, value) {
  if (!Number.isInteger(value) || value < 1 || value > 3) throw new Error("parallelism must be 1, 2, or 3");
  state.parallelism = value;
  state.time = 0;
}

export function snapshot(state) {
  const slots = Array(state.parallelism).fill(1);
  const tasks = [1.8, 2.4, 1.6, 2.2, 1.4, 1.9].map((duration, id) => {
    const worker = slots.indexOf(Math.min(...slots));
    const start = slots[worker];
    slots[worker] += duration;
    return { id, worker, start, end: slots[worker] };
  });
  const finish = Math.max(...slots);
  const cycle = finish + 2;
  const local = state.time % cycle;
  const phase = local < 1 ? "Planning" : local < finish ? "Executing" : local < finish + 1.2 ? "Reviewing" : "Delivered";
  const completed = tasks.filter((task) => task.end <= local).length;
  const busy = tasks.filter((task) => task.start <= local && local < task.end).map((task) => task.worker);
  return { ...state, cycle, local, phase, completed, busy, job: 1 + Math.floor(state.time / cycle), active: phase === "Planning" ? [0, 1, 2] : phase === "Executing" ? busy.map((worker) => worker + 3) : phase === "Reviewing" ? [6, 7] : [8], metrics: [`${completed}/6 tasks`, `${busy.length}/${state.parallelism} workers`, `${cycle.toFixed(1)}s / job`], readout: `Job ${1 + Math.floor(state.time / cycle)} · ${phase.toLowerCase()} · ${completed}/6 tasks` };
}
