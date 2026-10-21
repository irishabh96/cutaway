import { buildRig } from "../shared/cutaway-rig.mjs";

buildRig({
  id: "multi-agent-orchestration",
  fig: "Fig 10",
  title: "Multi-agent orchestration",
  eyebrow: "One plan. Many hands.",
  description: "Open the control plane, follow six tasks through a shared worker pool, and see why a review barrier waits for every worker.",
  labels: ["Intake", "Planner", "Router", "Worker A", "Worker B", "Worker C", "Merge", "Review", "Output"],
  details: ["Intake starts one educational job with six independent tasks.", "The planner prepares all six tasks before execution starts.", "The router dispatches the next waiting task to the first available worker.", "Worker A executes one task at a time; durations come from the model.", "Worker B joins the pool when parallelism is at least two.", "Worker C joins the pool when parallelism is three.", "The merge barrier waits until all six tasks have finished.", "Review runs for 1.2 simulated seconds after the barrier.", "Delivery completes the job, then the educational cycle repeats."],
  parameter: { label: "Parallel workers", min: 1, max: 3, value: 3 },
  caption: "A deterministic scheduling simulation, not a live AI service. Six tasks share up to three workers; merge and review begin only after all tasks finish. Open the layers to inspect each responsibility.",
});
