// Localization for runtime UI strings.
//
// Uses the VS Code l10n API (`vscode.l10n.t`), the standard mechanism for extensions: messages
// live in `l10n/bundle.l10n.json` (English source) and `l10n/bundle.l10n.<locale>.json`
// (translations), resolved from `vscode.env.language`.
//
// Webviews are a separate JS context with no access to `vscode.l10n`, so the host resolves the
// keys they need here and ships them in the `init` message; the webview scripts fall back to the
// English text until that arrives.

import * as vscode from "vscode";

/** Translate a key from the l10n bundle, substituting `{0}`, `{1}`… in order. */
export function t(key: string, ...args: string[]): string {
  return vscode.l10n.t(key, ...args);
}

/** Keys the webview scripts render. Sent to them as a key→text map with `init`. */
const WEBVIEW_KEYS = [
  "panel.selectAgent",
  "panel.loadingAgents",
  "panel.skipTooltip",
  "panel.resumeTooltip",
  "panel.launch",
  "panel.settingsTooltip",
  "panel.manageTooltip",
  "panel.tabDropdown",
  "panel.closeTab",
  "panel.emptyHint",
  "panel.noAgents",
  "panel.noAgentsHint",
  "panel.closeTabConfirm",
  "panel.closeTabConfirmAction",
  "manage.title",
  "manage.heading",
  "manage.checkUpdates",
  "manage.updateAll",
  "manage.updateAllCount",
  "manage.empty",
  "manage.currentVersion",
  "manage.latestVersion",
  "manage.notInstalled",
  "manage.checking",
  "manage.unknown",
  "manage.install",
  "manage.update",
  "manage.openSite",
  "manage.updateAvailable",
] as const;

/** Resolved webview strings for the current UI language. */
export function stringsForWebview(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of WEBVIEW_KEYS) {
    out[k] = vscode.l10n.t(k);
  }
  return out;
}
