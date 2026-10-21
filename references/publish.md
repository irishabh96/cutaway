# Sharing a Cutaway figure

The project showcase is https://cutaway.phasr.sh. To propose a figure, add its source to `examples/`, add a catalog entry, build both themes, and open a pull request on `irishabh96/cutaway`. Include the exact prompt, provenance, and visual checks. This is the standard contribution path.

## Optional compatible community galleries

`scripts/publish.mjs` remains available for galleries implementing the source-only `figures/<author>/<id>/src/`, `figure.json`, `.skill/`, and `scripts/validate.mjs` convention. Cutaway does not configure a separate community repository. Do not assume the main repository implements that schema.

Use a local clone of a compatible gallery the user selected:

```sh
node scripts/publish.mjs examples/dial-indicator --into /path/to/gallery \
  --id dial-indicator --title "Dial indicator" --author YOUR_GITHUB_USER \
  --prompt "/cutaway a dial indicator" --agent Codex --model YOUR_MODEL
```

This prepares source locally. Remote submission requires an explicit destination:

```sh
node scripts/publish.mjs examples/dial-indicator --into /path/to/gallery \
  --id dial-indicator --title "Dial indicator" --author YOUR_GITHUB_USER \
  --prompt "/cutaway a dial indicator" --agent Codex --model YOUR_MODEL \
  --submit --upstream OWNER/COMPATIBLE_GALLERY --dry-run
```

Review the plan with the user before submitting. After authorization, repeat with `--yes` instead of `--dry-run`. Never publish figures merely because they were generated. Only submit source the user owns or is permitted to share, under MIT or CC-BY-4.0. Never invent usage or timing measurements; pass `--minutes` and `--tokens` only if known. Without them the script reads time and tokens from the current Claude Code session's own logs (`scripts/session.mjs`: subagents included, idle stretches over ten minutes and cache reads left out); pass `--no-session` when the figure wasn't made in this session.

Compatible galleries may impose additional rules, such as no network access, environment reads, dynamic evaluation, outside imports, or continuous reduced-motion animation. Check their validator before submission. The helper supports framework-free HTML figures, not React components.
