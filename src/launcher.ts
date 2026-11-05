// Agent Launcher — ported from ai-agents-terminal-vsc.
//
// Adds a status-bar "Launch Agent" button that opens a Quick Pick of the AI
// agents detected on PATH and launches the chosen one in a *new* VS Code
// terminal (distinct from the docked Agent YOLO panel, which runs agents in an
// embedded PTY). It also contributes two status-bar toggles — YOLO (auto-approve)
// and Resume — for the launcher.
//
// Sharing: the launcher reuses the *same* agent catalog and `yolo.agents`
// overrides as the panel (resolveAgents() + agents.json + agentDetector), so
// there is exactly one agent list / config to maintain.
//
// Independence: the launcher's YOLO / Resume toggles use their OWN settings
// (`yolo.launcherYoloMode` / `yolo.launcherResumeMode`) and are deliberately
// NOT the panel's `yolo.skipEnabled` / `yolo.resumeMode`. This lets the
// launcher and the panel run in different modes — e.g. the launcher can launch
// auto-approved while the panel stays in prompt mode.

import * as fs from "fs";
import * as vscode from "vscode";
import {
  resolveAgents,
  getAgentConfigWarnings,
  type AgentDef,
} from "./agents";
import {
  canExecute,
  findExecutablePath,
  boostedPath,
} from "./agentDetector";
import * as settings from "./settings/settings";

// Commands contributed in package.json.
const LAUNCH_COMMAND = "yolo.launchAgent";
const TOGGLE_YOLO_COMMAND = "yolo.toggleLauncherYolo";
const TOGGLE_RESUME_COMMAND = "yolo.toggleLauncherResume";

// Launcher-specific settings (independent from the panel's yolo.skipEnabled /
// yolo.resumeMode — see the file header).
const LAUNCHER_YOLO_KEY = "launcherYoloMode";
const LAUNCHER_RESUME_KEY = "launcherResumeMode";

// Remembers the agent launched most recently so the next Quick Pick pre-selects
// it. Stored under the launcher's own globalState key.
const LAST_AGENT_KEY = "launcher.lastAgentCommand";

// Full extension id (<publisher>.<name>) for opening scoped Settings.
const EXTENSION_FULL_ID = "cnsharp.agentyolo";

/** Resolve an agent's bundled icon to a Uri, falling back to a terminal icon. */
function agentIcon(
  ctx: vscode.ExtensionContext,
  agent: AgentDef
): vscode.Uri | vscode.ThemeIcon {
  const icon = agent.icon;
  if (!icon) {
    return new vscode.ThemeIcon("terminal");
  }
  // The registry stores only the icon filename (e.g. `claude.svg`); VSC ships
  // PNGs, so prefer `<id>.svg` and fall back to `<id>.png` under media/agents.
  const base = icon.split("/").pop() ?? "";
  const name = base.replace(/\.[^.]+$/, "");
  const dir = vscode.Uri.joinPath(ctx.extensionUri, "media", "agents");
  for (const ext of ["svg", "png"]) {
    const candidate = vscode.Uri.joinPath(dir, `${name}.${ext}`);
    if (fs.existsSync(candidate.fsPath)) {
      return candidate;
    }
  }
  return new vscode.ThemeIcon("terminal");
}

/** Split a space-separated args string into tokens. Empty string => no tokens. */
function splitArgs(s: string | undefined): string[] {
  return (s ?? "").split(/\s+/).filter(Boolean);
}

/** Build the shell args for launching an agent, honouring YOLO and Resume mode.
 *  Resume flag is appended last so it applies on top of base + skip args. */
function buildShellArgs(
  agent: AgentDef,
  yolo: boolean,
  resume: boolean
): string[] {
  const args = splitArgs(agent.baseArgs);
  if (yolo && agent.skipFlag) {
    args.push(...splitArgs(agent.skipFlag));
  }
  if (resume && agent.resumeFlag) {
    args.push(...splitArgs(agent.resumeFlag));
  }
  return args;
}

/** Agents from the config whose `command` is actually installed (live probe). */
async function detectInstalled(agents: AgentDef[]): Promise<AgentDef[]> {
  const results = await Promise.all(
    agents.map(async (a) => (canExecute(a.command) ? a : null))
  );
  return results.filter((a): a is AgentDef => a !== null);
}

/** The set of installed agents, reusing YOLO-VSC's cached installed list (synced
 *  in the background by settings.syncInstalledAgents) and falling back to a live
 *  probe only when that cache is still empty (e.g. first run). */
async function installedAgents(): Promise<AgentDef[]> {
  const all = resolveAgents();
  const cached = settings.getInstalledCommands();
  if (cached.length > 0) {
    const lower = new Set(cached.map((c) => c.toLowerCase()));
    return all.filter((a) => lower.has(a.command.toLowerCase()));
  }
  return detectInstalled(all);
}

// Terminal-profile providers registered from code. Because `contributes.terminal`
// in package.json is static, it can't filter by what's installed — so we register
// a provider per installed agent here, and only those show up in the Terminal
// menu / "Select Default Profile" picker. Re-created whenever the installed set
// changes, so we track the disposables to clear the previous round.
let terminalProfileDisposables: vscode.Disposable[] = [];

/** Register one TerminalProfileProvider for each installed agent. The profile is
 *  built live so the launcher's YOLO / Resume mode is honoured at launch time. */
function registerInstalledTerminalProfiles(
  ctx: vscode.ExtensionContext,
  installed: AgentDef[]
) {
  terminalProfileDisposables.forEach((d) => d.dispose());
  terminalProfileDisposables = installed.map((agent) => {
    const provider: vscode.TerminalProfileProvider = {
      provideTerminalProfile: () => {
        const cfg = vscode.workspace.getConfiguration("yolo");
        const yolo = cfg.get<boolean>(LAUNCHER_YOLO_KEY, false);
        const resume = cfg.get<boolean>(LAUNCHER_RESUME_KEY, false);
        const shellArgs = buildShellArgs(agent, yolo, resume);
        // Remember this agent so the status-bar Quick Pick pre-selects it next time.
        void ctx.globalState.update(LAST_AGENT_KEY, agent.command);
        return new vscode.TerminalProfile({
          name: `AI: ${agent.displayName}`,
          shellPath: findExecutablePath(agent.command) ?? agent.command,
          shellArgs,
          env: { PATH: boostedPath() },
          iconPath: agentIcon(ctx, agent),
        });
      },
    };
    // id = label shown in the Terminal menu. Stable per agent command.
    return vscode.window.registerTerminalProfileProvider(
      `yolo.launcher.${agent.command}`,
      provider
    );
  });
}

async function pickAndLaunch(ctx: vscode.ExtensionContext) {
  const cfg = vscode.workspace.getConfiguration("yolo");
  const yolo = cfg.get<boolean>(LAUNCHER_YOLO_KEY, false);
  const resume = cfg.get<boolean>(LAUNCHER_RESUME_KEY, false);

  type AgentItem = {
    label: string;
    iconPath: vscode.Uri | vscode.ThemeIcon;
    agent: AgentDef;
  };
  type SettingsItem = {
    label: string;
    description: string;
    iconPath: vscode.ThemeIcon;
    openSettings: true;
  };
  type ManageItem = {
    label: string;
    description: string;
    iconPath: vscode.ThemeIcon;
    openManager: true;
  };
  type Item = AgentItem | SettingsItem | ManageItem;

  const installed = await installedAgents();
  let items: Item[] = installed.map((agent) => ({
    label: agent.displayName,
    iconPath: agentIcon(ctx, agent),
    agent,
  }));

  if (items.length === 0) {
    vscode.window.showInformationMessage(
      "No AI agents detected on PATH (looked for: " +
        resolveAgents().map((a) => a.command).join(", ") +
        ")."
    );
  }

  // Manage Agents entry: opens the Agent YOLO manager webview (yolo.openManager).
  items.push({
    label: "Manage Agents",
    description: "Install / upgrade agents",
    iconPath: new vscode.ThemeIcon("robot"),
    openManager: true,
  });

  // Settings entry pinned to the bottom of the list.
  items.push({
    label: "Settings",
    description: "Configure Agent YOLO",
    iconPath: new vscode.ThemeIcon("gear"),
    openSettings: true,
  });

  // Pre-select the agent the user launched most recently (if still installed).
  const lastCommand = ctx.globalState.get<string>(LAST_AGENT_KEY);
  const activeItem = lastCommand
    ? items.find(
        (i): i is AgentItem => "agent" in i && i.agent.command === lastCommand
      )
    : undefined;

  // createQuickPick (not showQuickPick) so we can pre-select via activeItems.
  const qp = vscode.window.createQuickPick<Item>();
  qp.items = items;
  qp.matchOnDescription = true;
  qp.placeholder = yolo
    ? "Launch an AI agent — YOLO mode (auto-approve) in a new terminal"
    : "Launch an AI agent in a new terminal";
  if (activeItem) {
    qp.activeItems = [activeItem];
  }
  qp.onDidAccept(() => {
    const picked = qp.selectedItems[0];
    qp.hide();
    if (!picked) {
      qp.dispose();
      return;
    }

    // Settings item: open the extension's scoped Settings UI.
    if ("openSettings" in picked) {
      void vscode.commands.executeCommand(
        "workbench.action.openSettings",
        `@ext:${EXTENSION_FULL_ID}`
      );
      qp.dispose();
      return;
    }

    // Manage Agents item: open the Agent YOLO manager webview.
    if ("openManager" in picked) {
      void vscode.commands.executeCommand("yolo.openManager");
      qp.dispose();
      return;
    }

    // YOLO / Resume mode: append the agent's auto-approve and resume args.
    const shellArgs = buildShellArgs(picked.agent, yolo, resume);

    // Remember this agent so the next Quick Pick pre-selects it.
    void ctx.globalState.update(LAST_AGENT_KEY, picked.agent.command);

    vscode.window
      .createTerminal({
        name: `AI: ${picked.agent.displayName}`,
        shellPath: findExecutablePath(picked.agent.command) ?? picked.agent.command,
        shellArgs,
        env: { PATH: boostedPath() },
        iconPath: agentIcon(ctx, picked.agent),
      })
      .show();
    qp.dispose();
  });
  qp.show();
}

/** Register the launcher: commands, status-bar buttons, terminal profiles, and
 *  the config-change listeners that keep the buttons + profiles in sync. */
export function registerLauncher(ctx: vscode.ExtensionContext): void {
  // "Launch Agent" command -> QuickPick of detected agents.
  ctx.subscriptions.push(
    vscode.commands.registerCommand(LAUNCH_COMMAND, () => pickAndLaunch(ctx))
  );

  // "Toggle Launcher YOLO mode" -> flips yolo.launcherYoloMode (independent).
  ctx.subscriptions.push(
    vscode.commands.registerCommand(TOGGLE_YOLO_COMMAND, async () => {
      const cfg = vscode.workspace.getConfiguration("yolo");
      const current = cfg.get<boolean>(LAUNCHER_YOLO_KEY, false);
      await cfg.update(
        LAUNCHER_YOLO_KEY,
        !current,
        vscode.ConfigurationTarget.Global
      );
    })
  );

  // "Toggle Launcher Resume mode" -> flips yolo.launcherResumeMode (independent).
  ctx.subscriptions.push(
    vscode.commands.registerCommand(TOGGLE_RESUME_COMMAND, async () => {
      const cfg = vscode.workspace.getConfiguration("yolo");
      const current = cfg.get<boolean>(LAUNCHER_RESUME_KEY, false);
      await cfg.update(
        LAUNCHER_RESUME_KEY,
        !current,
        vscode.ConfigurationTarget.Global
      );
    })
  );

  // Launcher button: opens the Quick Pick.
  const launcherSb = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  launcherSb.command = LAUNCH_COMMAND;
  launcherSb.text = "$(rocket) Launch Agent";
  launcherSb.tooltip = "Launch an AI agent in a new terminal";
  ctx.subscriptions.push(launcherSb);

  // YOLO toggle button (letter "Y"); highlighted when on.
  const yoloSb = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    99
  );
  yoloSb.command = TOGGLE_YOLO_COMMAND;
  ctx.subscriptions.push(yoloSb);

  // Resume toggle button (letter "R"); highlighted when on.
  const resumeSb = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    98
  );
  resumeSb.command = TOGGLE_RESUME_COMMAND;
  ctx.subscriptions.push(resumeSb);

  const refresh = () => {
    const cfg = vscode.workspace.getConfiguration("yolo");
    const yolo = cfg.get<boolean>(LAUNCHER_YOLO_KEY, false);
    const resume = cfg.get<boolean>(LAUNCHER_RESUME_KEY, false);
    launcherSb.tooltip = yolo
      ? "Launch an AI agent (YOLO / auto-approve) in a new terminal"
      : "Launch an AI agent in a new terminal";
    yoloSb.text = "Y";
    yoloSb.tooltip = yolo
      ? "Launcher YOLO mode ON — agents launch auto-approved. Click to turn off."
      : "Launcher YOLO mode OFF. Click to auto-approve launcher launches.";
    yoloSb.backgroundColor = yolo
      ? new vscode.ThemeColor("statusBarItem.warningBackground")
      : undefined;
    yoloSb.color = yolo
      ? undefined
      : new vscode.ThemeColor("statusBarItem.offForeground");
    resumeSb.text = "R";
    resumeSb.tooltip = resume
      ? "Launcher Resume mode ON — agents relaunch with their resume flag to continue the last session. Click to turn off."
      : "Launcher Resume mode OFF. Click to continue the last agent session.";
    resumeSb.backgroundColor = resume
      ? new vscode.ThemeColor("statusBarItem.warningBackground")
      : undefined;
    resumeSb.color = resume
      ? undefined
      : new vscode.ThemeColor("statusBarItem.offForeground");
    launcherSb.show();
    yoloSb.show();
    resumeSb.show();
  };

  refresh();

  // Seed terminal profiles from the current installed set, then refresh once the
  // background install-sync (settings.syncInstalledAgents) lands and updates
  // yolo.installedCommands.
  const seedProfiles = () => {
    void installedAgents().then((list) =>
      registerInstalledTerminalProfiles(ctx, list)
    );
  };
  seedProfiles();

  // Keep the buttons + terminal profiles in sync with settings / agent-list edits.
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration(`yolo.${LAUNCHER_YOLO_KEY}`) ||
        e.affectsConfiguration(`yolo.${LAUNCHER_RESUME_KEY}`)
      ) {
        refresh();
      }
      if (
        e.affectsConfiguration("yolo.installedCommands") ||
        e.affectsConfiguration("yolo.agents")
      ) {
        seedProfiles();
      }
      if (e.affectsConfiguration("yolo.agents")) {
        const warnings = getAgentConfigWarnings();
        if (warnings.length > 0) {
          console.warn(`[YOLO launcher] ${warnings.join(" ")}`);
        }
      }
    })
  );

  // Surface structural config warnings (duplicates) at startup too.
  const warnings = getAgentConfigWarnings();
  if (warnings.length > 0) {
    console.warn(`[YOLO launcher] ${warnings.join(" ")}`);
  }
}
