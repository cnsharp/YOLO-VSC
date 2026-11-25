// Controls which generated `.agent.md` files are visible in VS Code native
// chat. Every generated agent carries a `when: yolo.agentInstalled.<id>` clause,
// and this module keeps those context keys in sync with the installed set.

import * as vscode from "vscode";
import { resolveAgents } from "../agents";
import { getInstalledCommands, syncInstalledAgents, getCustomTools } from "../settings/settings";
import { canExecute, invalidateExecutableCache } from "../agentDetector";

/** Context key used by the generated chatAgents contribution. Hyphens are not safe in `when` expressions. */
export function agentContextKey(id: string): string {
  return `yolo.agentInstalled.${id.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

let knownKeys = new Set<string>();

/** Refresh the `yolo.agentInstalled.*` context keys from the current catalog + installed set. */
export function syncNativeChatAgentContext(): void {
  const installed = new Set(getInstalledCommands());
  const available = new Set<string>();

  for (const agent of resolveAgents()) {
    if (installed.has(agent.command.toLowerCase())) {
      available.add(agentContextKey(agent.id));
    }
  }

  // Include keys we set before so that uninstalled / newly hidden agents get an
  // explicit false instead of keeping their old true value.
  for (const key of new Set([...knownKeys, ...available])) {
    void vscode.commands.executeCommand("setContext", key, available.has(key));
  }
  knownKeys = available;
}

/**
 * Full re-probe of installed CLIs, used after an external uninstall/install
 * (e.g. `brew uninstall`) that VS Code cannot observe on its own. Clears the
 * detector cache so the probe sees the filesystem as it is now.
 */
export async function refreshNativeChatAgents(): Promise<void> {
  invalidateExecutableCache();
  await syncInstalledAgents(
    resolveAgents().map((a) => ({ id: a.id, command: a.command })),
    getCustomTools(),
    canExecute
  );
  syncNativeChatAgentContext();
}
