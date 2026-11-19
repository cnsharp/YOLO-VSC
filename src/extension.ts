// Agent YOLO (panel) entry point: docks the agents webview panel in the activity bar and bridges
// it to the embedded PTY. Ported from the IntelliJ plugin's activation / tool-window wiring.

import * as vscode from "vscode";
import { YoloViewProvider } from "./terminal/panel";
import { AgentManagerPanel } from "./manage/managerPanel";
import { initBuiltInAgents, resolveAgents, getAgentConfigWarnings } from "./agents";
import { loadCachedBuiltIns, refreshOnStartup } from "./agentCatalog";
import { canExecute } from "./agentDetector";
import * as settings from "./settings/settings";

export function activate(context: vscode.ExtensionContext): void {
  // Load the built-in catalog, then overlay the last-good hot-update cache so
  // the previous catalog shows instantly before the network refresh completes.
  initBuiltInAgents(context);
  loadCachedBuiltIns(context);

  // Structural config problems (duplicate command / name / id) — logged to the
  // console only (no popup), matching ai-agents-terminal-vsc. Surfaced at startup
  // and whenever the agent config changes.
  const warnAgentConfig = () => {
    const warnings = getAgentConfigWarnings();
    if (warnings.length > 0) {
      console.warn(`[YOLO] ${warnings.join(" ")}`);
    }
  };
  warnAgentConfig();

  // Re-surface config warnings when the agent config changes.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("yolo") || e.affectsConfiguration("yolo.agents")) {
        warnAgentConfig();
      }
    })
  );

  const panel = new YoloViewProvider(context.extensionUri, context.globalStorageUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(YoloViewProvider.viewType, panel)
  );

  // Startup sequence — order matters: fetch/merge the remote catalog FIRST, then
  // re-scan the installed set against the FINAL merged catalog, then refresh the
  // UI. Scanning before the catalog settles would filter the panel list against
  // a stale agent set. `onSettled` fires on 200/304/failure, so the scan always
  // runs after the catalog step, with whatever catalog is now current.
  void refreshOnStartup(context, () => {
    // Re-scan installed agents now that the catalog is final. The panel renders
    // cache-first and re-renders once this probe lands; sendInit after it so a
    // panel opened early gets the corrected list (no-op while view is closed).
    settings
      .syncInstalledAgents(
        resolveAgents().map((a) => ({ id: a.id, command: a.command })),
        settings.getCustomTools(),
        canExecute
      )
      .then(() => {
        panel.sendInit();
        AgentManagerPanel.refreshIfOpen();
      })
      .catch((e) => console.error("[YOLO] syncInstalledAgents threw:", e));
  });
  // Kill the running PTY on extension deactivation so the agent process isn't orphaned. The session is
  // intentionally kept alive across view hide/move (re-attached, not disposed); only full deactivation
  // tears it down.
  context.subscriptions.push(vscode.Disposable.from(panel));

  // Open Agents Panel: focus the docked view (creates it on first use).
  context.subscriptions.push(
    vscode.commands.registerCommand("yolo.openPanel", () => panel.reveal())
  );

  // Manage Agents: open the full-page manager (editor-area tab) with install/upgrade actions.
  context.subscriptions.push(
    vscode.commands.registerCommand("yolo.openManager", () =>
      AgentManagerPanel.show(context)
    )
  );
}

export function deactivate(): void {
  // Views dispose themselves; nothing persistent to tear down here.
}
