# Agent YOLO — AI Agents Extender (VS Code)

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/cnsharp.agentyolo?label=VS%20Code%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=cnsharp.agentyolo)

The VS Code edition of the *Agent YOLO* family. It opens an embedded terminal
panel that launches AI CLI agents (Claude Code, Codex, Cursor CLI, …) with a one-click
**Skip permissions (YOLO)** toggle, and makes terminal output clickable: file paths, stack-trace
frames, type/member names, and URLs all become navigation links.

> Extension ID: `cnsharp.agentyolo` — display name **Agent YOLO**.

## Screenshots

**Agents panel** — embedded multi-tab agent terminal with clickable links:

![Agent YOLO panel — embedded multi-tab agent terminal with clickable links](media/screenshots/vsc-yolo-panel.png)

## Features

- **Agents panel**: a docked activity-bar view with an agent dropdown, populated from the built-in catalog in `agents.json` + your `yolo.agents` overrides, filtered by what is actually installed on PATH.
- **Embedded interactive terminal**: a real PTY (node-pty + bundled xterm.js) launched inside a login shell, so rc-defined PATH (nvm / fnm / npm global bin) is honoured. Several agents run side by side as **tabs**; each tab keeps its own scrollback and input history.
- **YOLO toggle** injects the per-agent skip-permission flag (e.g. `--dangerously-skip-permissions`, `-y`, `--yolo`) or environment variable (`GOOSE_MODE=auto`) so agents run without permission prompts.
- **Resume toggle** continues the agent's most recent session via its `resumeFlag` (e.g. Claude `-r`, Codex `--resume`).
- **Clickable terminal links** with de-duplication / priority: `path:line:col`, quoted paths, stack-trace frames, bare file names, Python tracebacks, type names (`com.foo.Bar`), `Class.member` refs, and `http(s)://` URLs.
  (**Type / member links need a language server** — see [Language support](#language-support-install-a-language-server-to-navigate-typemember-links).)
- **Settings-driven**: agent configuration (skip flags / base args / resume flags, global YOLO & Resume defaults, shell) lives in **VS Code Settings** — edit `yolo.agents` and the other `yolo.*` settings in `settings.json`. There is no in-panel Settings UI. (Internal extension IDs/settings keep the `yolo.` prefix — e.g. the view is `yolo.panel`, settings are `yolo.*` — while the product is branded **Agent YOLO**.)

> **Panel location.** The Agents panel opens in the **Primary Side Bar** (the activity bar, on the left) by default.
> To dock it on the right instead, right-click the panel header and choose **Move to Secondary Side Bar** —
> VS Code remembers the choice.

> **Co-existence.** Agent YOLO (`cnsharp.agentyolo`) uses the dedicated `yolo.*` settings namespace and its own
> commands/views, so it can be installed alongside other agent-launcher extensions without conflict.

## Language support (install a language server to navigate type/member links)

File-path links work out of the box (they are resolved on the filesystem). **Type and member links
(`com.foo.Bar`, `Class.member`) are different**: they are resolved through
`vscode.executeWorkspaceSymbolProvider`, i.e. the LSP `workspace/symbol` — so a **language server must
be running and must have indexed the symbol** for the link to open. Without one you get
"no symbol found".

Install the language server for the languages you actually work in:

| Language | Extension | Extension ID |
|---|---|---|
| Java | Language Support for Java (Red Hat) | `redhat.java` |
| TypeScript / JavaScript | *built in — nothing to install* | — |
| Python | Python **+ Pylance** (Pylance provides the symbols) | `ms-python.python`, `ms-python.vscode-pylance` |
| Go | Go (gopls) | `golang.go` |
| Rust | rust-analyzer | `rust-lang.rust-analyzer` |
| C / C++ | C/C++ | `ms-vscode.cpptools` |
| C# | C# | `ms-dotnettools.csharp` |
| Kotlin | Kotlin | `fwcd.kotlin` |
| PHP | Intelephense | `bmewburn.vscode-intelephense-client` |
| Ruby | Ruby LSP | `shopify.ruby-lsp` |
| Scala | Metals | `scalameta.metals` |
| Swift | Swift | `sswg.swift-lang` |
| Lua | Lua | `sumneko.lua` |
| Dart / Flutter | Dart | `Dart-Code.dart-code` |
| Shell | Bash IDE | `mads-hartmann.bash-ide-vscode` |

Notes:

- **Open the code as a workspace folder** and let the language server finish indexing (large
  Java/Python projects can take a while on first open) — unindexed symbols cannot be resolved.
- A plain syntax-highlighter or formatter is **not** enough; it must be a real language server.
- Install only what you need: each one is a resident process with its own memory, which adds up
  alongside several open agent terminals.
- For Java, prefer **Red Hat** (`redhat.java`); the Oracle Java extension's `workspace/symbol`
  support is unreliable.

## Install

### From the VS Code Marketplace (recommended)

- Open the [Agent YOLO Marketplace page](https://marketplace.visualstudio.com/items?itemName=cnsharp.agentyolo) and click **Install**.
- Or in VS Code: open the **Extensions** view, search for `Agent YOLO`, and click **Install**.
- Or from the command line:

  ```sh
  code --install-extension cnsharp.agentyolo
  ```

### Run from source (development / trial)

1. Install dependencies: `npm install` (also runs `postinstall` to fix node-pty's `spawn-helper` permissions).
2. Build: `npm run build` (tsc for the extension + esbuild to bundle the webview into `media/dist`).
3. Press **F5** to open the Extension Development Host; the **Agent YOLO** icon appears in the activity bar.

### Package / install as VSIX

- Package: `npx @vscode/vsce package` (produces a `*.vsix`)
- Install: in VS Code run `Extensions: Install from VSIX...` and pick the generated file.

## Usage

### Open the panel

- Click the **Agent YOLO** icon in the activity bar, or run **`Agent YOLO: Open Agents Panel`** from the Command Palette (command id `yolo.openPanel`).

### Launch an agent

- Pick an agent from the dropdown in the panel header and click **Launch** — it opens in a new terminal tab. Only agents detected on PATH are shown.
- Open more agents to run several side by side; switch tabs like any IDE terminal.

### YOLO mode (skip permissions / auto-approve)

- Click the `$(zap)` button in the panel header to toggle YOLO mode. When on, launching an agent appends that agent's `skipFlag` (or `GOOSE_MODE=auto` for Goose).
- The global default can also be set via the `yolo.skipEnabled` setting.

### Resume mode (continue session)

- Click the `$(history)` button in the panel header to toggle Resume mode. When on, launching an agent appends that agent's `resumeFlag` to continue the previous session. Agents without a `resumeFlag` launch normally even when on.
- YOLO and Resume can be on together; args are ordered `baseArgs` → `skipFlag` → `resumeFlag`.
- The global default can also be set via the `yolo.resumeMode` setting.

### Configure agents (no code required)

The **`yolo.agents`** setting is a list of overrides / additions **merged** with the built-in catalog in `agents.json`: match a built-in by `command` (or `id`) to override it (only the fields you set are replaced); set `enabled` to `false` to hide a built-in; use a `command` not present in `agents.json` to add a custom agent.

- **Edit**: the built-ins live in the root `agents.json`; to tweak a built-in, append an override entry with the same `command` (only the fields you want to change).
- **Override params**: change only the fields you want, e.g. set `claude`'s `skipFlag` to `"--new-flag"`.
- **Hide**: set `enabled` to `false` (or delete the entry).
- **Add a custom agent**: append an entry whose `command` isn't built-in, e.g.:

  ```json
  { "command": "myagent", "displayName": "My Agent", "baseArgs": "run", "iconFile": "myagent.png" }
  ```

  (omit `iconFile` to use the default terminal icon.)
- **When it takes effect**: changes apply the next time the panel refreshes (read live at runtime; no window reload needed).

Fields: `command` (required) / `displayName` / `baseArgs` / `skipFlag` / `resumeFlag` / `iconFile` / `enabled` / `id`.

> Uniqueness: `command`, `displayName`, and `id` must each be unique. On duplicates the extension warns and drops the duplicate (keeping the first occurrence).

### Supported agent list

| id | display name | command (PATH detection) | website |
|---|---|---|---|
| claude | Claude Code | `claude` | <a href="https://claude.ai/"><img src="media/agents/claude.png" height="20" alt="Claude Code"></a> |
| codex | Codex | `codex` | <a href="https://openai.com/codex"><img src="media/agents/codex.png" height="20" alt="Codex"></a> |
| cursor | Cursor | `cursor-agent` | <a href="https://cursor.com/"><img src="media/agents/cursor.png" height="20" alt="Cursor"></a> |
| copilot | GitHub Copilot | `copilot` | <a href="https://github.com/features/copilot"><img src="media/agents/copilot.png" height="20" alt="GitHub Copilot"></a> |
| opencode | OpenCode | `opencode` | <a href="https://opencode.ai/"><img src="media/agents/opencode.png" height="20" alt="OpenCode"></a> |
| aider | Aider | `aider` | <a href="https://aider.chat/"><img src="media/agents/aider.png" height="20" alt="Aider"></a> |
| cline | Cline | `cline` | <a href="https://cline.bot/"><img src="media/agents/cline.png" height="20" alt="Cline"></a> |
| continue | Continue | `cn` | <a href="https://continue.dev/"><img src="media/agents/continue.png" height="20" alt="Continue"></a> |
| openclaw | OpenClaw | `openclaw` | <a href="https://openclaw.ai/"><img src="media/agents/openclaw.png" height="20" alt="OpenClaw"></a> |
| kiro | Kiro | `kiro-cli` | <a href="https://kiro.dev/"><img src="media/agents/kiro.png" height="20" alt="Kiro"></a> |
| goose | Goose | `goose` | <a href="https://block.github.io/goose/"><img src="media/agents/goose.png" height="20" alt="Goose"></a> |
| crush | Charm Crush | `crush` | <a href="https://charm.sh/crush"><img src="media/agents/crush.png" height="20" alt="Charm Crush"></a> |
| amp | Amp | `amp` | <a href="https://ampcode.com/"><img src="media/agents/amp.png" height="20" alt="Amp"></a> |
| kimi | Kimi | `kimi` | <a href="https://kimi.moonshot.cn/"><img src="media/agents/kimi.png" height="20" alt="Kimi"></a> |
| qwen-code | Qwen Code | `qwen` | <a href="https://qwen.ai/qwencode"><img src="media/agents/qwen-code.png" height="20" alt="Qwen Code"></a> |
| trae | TraeCode | `traecli` | <a href="https://www.trae.ai/"><img src="media/agents/trae.png" height="20" alt="TraeCode"></a> |
| codebuddy | CodeBuddy | `codebuddy` | <a href="https://www.codebuddy.ai/"><img src="media/agents/codebuddy.png" height="20" alt="CodeBuddy"></a> |
| qoder | Qoder | `qoder` | <a href="https://qoder.com/"><img src="media/agents/qoder.png" height="20" alt="Qoder"></a> |
| devin | Devin | `devin` | <a href="https://devin.ai/"><img src="media/agents/devin.png" height="20" alt="Devin"></a> |
| grok | Grok | `grok` | <a href="https://grok.com/"><img src="media/agents/grok.png" height="20" alt="Grok"></a> |
| antigravity | Antigravity | `agy` | <a href="https://antigravity.google/"><img src="media/agents/antigravity.png" height="20" alt="Antigravity"></a> |
| mistral-vibe | Mistral Vibe | `vibe` | <a href="https://mistral.ai/"><img src="media/agents/mistral-vibe.png" height="20" alt="Mistral Vibe"></a> |
| kilo | Kilo Code | `kilo` | <a href="https://kilocode.ai/"><img src="media/agents/kilo.png" height="20" alt="Kilo Code"></a> |
| hermes | Hermes | `hermes` | <a href="https://hermes-agent.nousresearch.com/"><img src="media/agents/hermes.png" height="20" alt="Hermes"></a> |
| pi | Pi | `pi` | <a href="https://pi.dev/"><img src="media/agents/pi.png" height="20" alt="Pi"></a> |
| droid | Droid | `droid` | <a href="https://factory.ai/"><img src="media/agents/droid.png" height="20" alt="Droid"></a> |
| aug | Auggie | `auggie` | <a href="https://augmentcode.com/"><img src="media/agents/aug.png" height="20" alt="Auggie"></a> |
| rovo | Rovo Dev | `rovo` | <a href="https://rovo.atlassian.com/"><img src="media/agents/rovo.png" height="20" alt="Rovo Dev"></a> |
| prime-agent | Prime Agent | `prime-agent` | <a href="https://www.primeintellect.ai/"><img src="media/agents/prime-agent.png" height="20" alt="Prime Agent"></a> |
| autohand | Autohand | `autohand` | <a href="https://autohand.ai/"><img src="media/agents/autohand.png" height="20" alt="Autohand"></a> |
| command-code | Command Code | `command-code` | <a href="https://commandcode.ai/"><img src="media/agents/command-code.png" height="20" alt="Command Code"></a> |
| ante | Ante | `ante` | <a href="https://antigma.ai/"><img src="media/agents/ante.png" height="20" alt="Ante"></a> |
| codebuff | Codebuff | `codebuff` | <a href="https://codebuff.com/"><img src="media/agents/codebuff.png" height="20" alt="Codebuff"></a> |
| omp | OMP | `omp` | <a href="https://ohmyposh.dev/"><img src="media/agents/omp.png" height="20" alt="OMP"></a> |

> Logos live in `media/agents/` (PNG). The picker shows only the display name, not the command / id.
## Settings reference

| Setting | Type | Default | Description |
|---|---|---|---|
| `yolo.skipEnabled` | boolean | `false` | Master switch for YOLO mode; when on, agents launch with their respective `skipFlag` |
| `yolo.resumeMode` | boolean | `false` | Master switch for Resume mode; when on, agents launch with their respective `resumeFlag` |
| `yolo.agents` | array | `[]` | Overrides / additions merged with `agents.json` (see above) |
| `yolo.permissionRules` | array | `[]` | Per-agent skip flag as `{ agentId, flag }`; takes precedence over `yolo.agents` `skipFlag` |
| `yolo.agentResumeFlags` | object | `{}` | Per-agent resume-flag override, keyed by `command` / `id`; precedence over `resumeFlag` |
| `yolo.agentBaseArgs` | object | `{}` | Extra launch args per agent, keyed by `id` (`command` fallback); appended after `baseArgs` |
| `yolo.shell` | string | `""` | Override the shell used to launch agents / probe PATH (absolute path or PATH binary; on Windows auto-detects a POSIX shell when empty) |
| `yolo.shellArgs` | array | `[]` | Extra args passed to the shell before the agent command (ignored on Windows `cmd.exe`) |
| `yolo.installedCommands` | array (internal) | `[]` | Cache of agent commands detected on PATH — maintained automatically, do not edit by hand |
| `yolo.lastAgentId` | string (internal) | `""` | Last-selected agent id, so the panel can pre-select it — set automatically |

Commands:

| Command id | Title | Trigger |
|---|---|---|
| `yolo.openPanel` | Agent YOLO: Open Agents Panel | activity-bar icon / Command Palette |

## Build & run (development)

```bash
npm install        # installs deps + runs postinstall (node-pty spawn-helper chmod)
npm run build      # tsc (extension + webview entries) + esbuild (bundle xterm into media/dist)
npm test           # unit tests for the link engine
# Press F5 in VS Code with this folder open -> "Run Extension" launches a new Extension Development Host.
# Run the command: Agent YOLO: Open Agents Panel
```

## Layout

```
src/
  extension.ts                 activation + command + view-provider registration
  agents.ts                    loads the built-in catalog from agents.json + resolveAgents()/getAgentConfigWarnings()
  agentDetector.ts             install detection (resolvePath / canExecute), login shell so rc PATH is honoured
  settings/                    settings.json-backed config (schema in package.json contributes.configuration)
  links/                       link regex patterns (ported) + line parser
  navigation/                  file open + workspace-symbol lookup (gotoClassContributor equivalent)
  terminal/
    terminalProvider.ts        node-pty spawn (ported launch path)
    panel.ts                   WebviewViewProvider owning the PTY + message bridge
    panelHtml.ts               CSP-safe HTML renderer for the bundled webview
    shell.ts                   shell resolution (yolo.shell / yolo.shellArgs)
  webview/
    panel.ts                   bundled webview entry: xterm + combined link provider
media/dist/                    esbuild output (bundled xterm) — referenced by the webview
media/agents/                 agent logos (PNG)
media/icons/                  activity-bar / panel icons + Y/R toggle SVGs
scripts/
  ensure-node-pty-exec.cjs     postinstall: chmod node-pty's spawn-helper executable
test/                          node:test unit tests (linkPatterns / linkParser)
```

The webview is bundled with esbuild (no CDN) and served from `localResourceRoots` with a strict CSP.

## Architecture notes

1. **Panel (activity bar)**: `activate()` loads the built-in catalog (`initBuiltInAgents`), refreshes the installed cache, and registers `YoloViewProvider` for the `yolo.panel` webview view inside the `yolo-agents` activity-bar container. The panel's `yolo.openPanel` command reveals/focuses it.
2. **Install detection**: `canExecute(command)` runs `<command> --version` in a login-interactive shell, treating exit code 0 as installed; results are cached in the `yolo.installedCommands` setting so PATH isn't re-probed per window. It uses `$SHELL -lc` on macOS/Linux and `where` on Windows, so it honours PATH injected by rc files (nvm / fnm / brew / npm-global, etc.).
3. **Embedded terminal**: `terminalProvider.ts` spawns the agent via node-pty inside a login shell; the PTY output is bridged to the bundled xterm webview, and user input is written back. Each Launch opens a new tab with its own scrollback.
4. **Clickable links**: the webview's combined link provider scans terminal output with the patterns in `links/` and turns matches into navigable links — file paths open in the editor, type/member links resolve via the workspace-symbol provider (needs a language server), and URLs open in the browser.
5. **Settings-driven**: `resolveAgents()` merges the `agents.json` built-in catalog with the `yolo.agents` setting by `command` / `id`, and validates `command` / `displayName` / `id` uniqueness (`getAgentConfigWarnings` emits the warnings).

## How to add an agent

Two paths, depending on whether you want to ship code:

**Path A: settings only (recommended, user-side, no rebuild)**

Append an entry to `yolo.agents` in your `settings.json`:

```json
{ "command": "myagent", "displayName": "My Agent", "baseArgs": "", "skipFlag": "--auto", "iconFile": "myagent.png" }
```

Drop the logo into `media/agents/myagent.png` — no recompile needed.

**Path B: add as a built-in (code-side)**

1. Edit the root `agents.json` and append an entry (`id` / `command` / `displayName` / `baseArgs` / `skipFlag` / `resumeFlag` / `iconFile`).
2. Put the corresponding PNG into `media/agents/`.
3. `npm run build`, then reload the window.

> Note: the runtime setting is authoritative. If a user has overridden `yolo.agents`, a newly added built-in only appears once they also add it to their setting (or remove the override to restore the defaults).
