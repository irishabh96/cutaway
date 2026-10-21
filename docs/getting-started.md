# Getting started

Cutaway turns a prompt into an interactive cutaway of software, infrastructure, agents, or machines. Install the skill in your coding agent, then ask for a system, an interaction, and an output format. Your agent supplies its normal model access; the generated figure needs no API key or backend.

## Install in 30 seconds

The skills CLI currently needs Node.js 22.20 or newer. The rendering kit itself supports Node.js 20.10+. Chrome or Chromium is needed for screenshots and visual checks.

```sh
npx skills add irishabh96/cutaway -g
```

Choose an agent interactively, or use one of these commands:

| Agent | Global installation |
| --- | --- |
| Claude Code | `npx skills add irishabh96/cutaway -g -a claude-code` |
| Antigravity | `npx skills add irishabh96/cutaway -g -a antigravity` |
| OpenCode | `npx skills add irishabh96/cutaway -g -a opencode` |
| Codex | `npx skills add irishabh96/cutaway -g -a codex` |
| MiniMax Code | `npx skills add irishabh96/cutaway -g -a minimax-code` |

Omit `-g` for a project installation. The CLI may use a shared skill directory and agent links; its reported installation path is authoritative. See the [skills CLI installation reference](https://github.com/vercel-labs/skills/blob/main/docs/installation.md).

In slash-command agents:

```text
/cutaway explain a shared token bucket: three edge clients, capacity 12, refill 3/s. Open the layers to inspect the coordinator. Standalone HTML, light and dark.
```

In Codex, use `$cutaway` in place of `/cutaway`.

## Install with git

These are direct clone destinations; choose the one for your agent:

```sh
git clone https://github.com/irishabh96/cutaway.git ~/.claude/skills/cutaway
git clone https://github.com/irishabh96/cutaway.git ~/.gemini/antigravity/skills/cutaway
git clone https://github.com/irishabh96/cutaway.git ~/.config/opencode/skills/cutaway
git clone https://github.com/irishabh96/cutaway.git ~/.agents/skills/cutaway
git clone https://github.com/irishabh96/cutaway.git ~/.minimax/skills/cutaway
```

For one repository, use the corresponding project destination:

| Agent | Project clone command |
| --- | --- |
| Claude Code | `git clone https://github.com/irishabh96/cutaway.git .claude/skills/cutaway` |
| Antigravity | `git clone https://github.com/irishabh96/cutaway.git .agents/skills/cutaway` |
| OpenCode | `git clone https://github.com/irishabh96/cutaway.git .opencode/skills/cutaway` |
| Codex | `git clone https://github.com/irishabh96/cutaway.git .agents/skills/cutaway` |
| MiniMax Code | `git clone https://github.com/irishabh96/cutaway.git .minimax/skills/cutaway` |

The installed folder must contain `SKILL.md` directly. To update a git installation, run `git pull --ff-only` inside it.

## Download without git

For Codex on macOS or Linux:

```sh
mkdir -p ~/.agents/skills/cutaway && curl -fsSL https://github.com/irishabh96/cutaway/archive/refs/heads/main.tar.gz | tar -xz --strip-components=1 -C ~/.agents/skills/cutaway
```

For Claude Code:

```sh
mkdir -p ~/.claude/skills/cutaway && curl -fsSL https://github.com/irishabh96/cutaway/archive/refs/heads/main.tar.gz | tar -xz --strip-components=1 -C ~/.claude/skills/cutaway
```

For another agent, substitute its global destination from the git commands above. Use a fresh destination to avoid mixing versions.

On Windows PowerShell, this installs for Codex using Windows' built-in `tar`:

```powershell
$cutawayDir = Join-Path $env:USERPROFILE '.agents/skills/cutaway'; $cutawayArchive = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName() + '.tar.gz'); New-Item -ItemType Directory -Force $cutawayDir | Out-Null; Invoke-WebRequest 'https://github.com/irishabh96/cutaway/archive/refs/heads/main.tar.gz' -OutFile $cutawayArchive; if ($?) { tar -xzf $cutawayArchive --strip-components=1 -C $cutawayDir }; Remove-Item -LiteralPath $cutawayArchive
```

Use `.claude/skills/cutaway`, `.gemini/antigravity/skills/cutaway`, `.config/opencode/skills/cutaway`, or `.minimax/skills/cutaway` for the other agents. You can also [download the ZIP](https://github.com/irishabh96/cutaway/archive/refs/heads/main.zip), extract it, and rename its folder to `cutaway`.

## Build and explore the project

The kit and standalone example builds use Node built-ins. Website builds, React previews, tests, and video encoding use development dependencies:

```sh
git clone https://github.com/irishabh96/cutaway.git
cd cutaway
npm ci
npm run build
npm run dev
```

Open the printed local URL. The static output is `dist/`; it contains the gallery, docs, examples, source, media, and license. For one standalone example:

```sh
node examples/multi-agent-orchestration/build.mjs --light --audit
```

Open the generated HTML directly, or use the showcase. Full contributor instructions are in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Troubleshooting

- **Skill missing:** check that `cutaway/SKILL.md` exists directly under a supported skills directory. Restart the agent. Claude Code versions supporting `/reload-skills` can reload that way; Codex supports explicit `$cutaway` invocation. See the [official skill documentation](https://learn.chatgpt.com/docs/build-skills).
- **Slash command unavailable:** use `$cutaway` in Codex, or ask the agent to use the installed Cutaway skill by name. Invocation UI varies by agent version.
- **Chrome not found:** install Chrome or Chromium, or set `CHROME_PATH` to its executable. No browser is needed just to open a generated figure.
- **Headless Chrome blocked in Codex:** browser checks create a temporary profile and open a local debugging port. Permit that check through the approval controls available in your environment, or run it in a normal terminal. Managed environments may not permit escalation; follow your environment's policy. See [Codex security](https://developers.openai.com/codex/security/).
- **WebGL unavailable:** run `node scripts/drive.mjs PAGE.html '[]' --no-webgl` to inspect the SVG fallback. Shaders use WebGL, but the underlying figure remains SVG.
- **Wrong theme:** standalone pages choose their theme at build time. Build with `--light`; changing the browser's preferred color scheme does not rewrite a dark page.
- **Video encoder missing:** `npm ci` provides FFmpeg for supported platforms. Otherwise set `FFMPEG_PATH` to a system FFmpeg executable.
- **Archive returns 404:** check the repository and branch URL and your access. Installation commands require the source to be published to that repository.

Installation behavior was checked against the [skills CLI](https://github.com/vercel-labs/skills) and [OpenAI skill documentation](https://learn.chatgpt.com/docs/build-skills) on 2026-10-20.
