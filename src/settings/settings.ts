// Ported concept from IntelliJ: AgentExtenderSettings (PersistentStateComponent) -> VS Code WorkspaceConfiguration.
// IntelliJ persisted to agentExtender.xml via @State; VS Code persists to settings.json / globalState.

import * as vscode from "vscode";

export interface PermissionRule {
  agentId: string;
  flag: string;
}

/**
 * Shape of an entry in the `yolo.agents` setting — user overrides / additions merged on top of the
 * built-in catalog in agents.json. It is identical to the built-in `AgentConfig` shape
 * (see src/agents.ts) so a built-in entry can be copy-pasted into the override and vice-versa,
 * and so users can override `skipFlag` / `resumeFlag` per agent. `command` is required.
 *
 * All of this product's settings live under `yolo.*`, including the agent overrides.
 */
export interface UserAgentOverride {
  id?: string;
  displayName?: string;
  command: string;
  baseArgs?: string;
  skipFlag?: string;
  resumeFlag?: string;
  icon?: string;
  /** @deprecated use `icon` (filename); kept for backward-compatible user overrides that pass a full path. */
  iconFile?: string;
  /** Set false to hide this agent (or a matching built-in) from the panel. Defaults to true. */
  enabled?: boolean;
}

function cfg(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("yolo");
}

export function getSkipEnabled(): boolean {
  return cfg().get<boolean>("skipEnabled", false);
}

export function setSkipEnabled(value: boolean): void {
  cfg().update("skipEnabled", value, vscode.ConfigurationTarget.Global);
}

export function getResumeMode(): boolean {
  return cfg().get<boolean>("resumeMode", false);
}

/** Whether the skip-permissions launch warning has been suppressed by the user. */
export function getSuppressSkipWarning(): boolean {
  return cfg().get<boolean>("suppressSkipWarning", false);
}

export function setSuppressSkipWarning(value: boolean): void {
  cfg().update("suppressSkipWarning", value, vscode.ConfigurationTarget.Global);
}

/**
 * Per-agent override of the resume flag (the flag appended when Resume mode is on). Keyed by agent
 * `command` or `id`. Takes precedence over the built-in value in agents.json / `yolo.agents`, so a
 * user can tune resume behaviour per agent without editing agents.json. Example:
 *   "yolo.agentResumeFlags": { "codebuddy": "-r", "claude": "--resume" }
 * When an agent is absent here, its `resumeFlag` from agents.json (or `yolo.agents`) is used.
 */
export function getAgentResumeFlags(): Record<string, string> {
  return cfg().get<Record<string, string>>("agentResumeFlags", {});
}

export function setResumeMode(value: boolean): void {
  cfg().update("resumeMode", value, vscode.ConfigurationTarget.Global);
}

export function getPermissionRules(): PermissionRule[] {
  return cfg().get<PermissionRule[]>("permissionRules", []);
}

export function setPermissionRules(rules: PermissionRule[]): void {
  cfg().update("permissionRules", rules, vscode.ConfigurationTarget.Global);
}

export function getCustomTools(): UserAgentOverride[] {
  return vscode.workspace.getConfiguration("yolo").get<UserAgentOverride[]>("agents", []);
}

export function setCustomTools(tools: UserAgentOverride[]): void {
  vscode.workspace
    .getConfiguration("yolo")
    .update("agents", tools, vscode.ConfigurationTarget.Global);
}

export function getAgentBaseArgs(): Record<string, string> {
  return cfg().get<Record<string, string>>("agentBaseArgs", {});
}

export function setAgentBaseArgs(map: Record<string, string>): void {
  cfg().update("agentBaseArgs", map, vscode.ConfigurationTarget.Global);
}

/**
 * In-memory mirror of the installed-agent set. `cfg().update(...)` is asynchronous in real VS Code —
 * the write isn't observable on the very next `cfg().get(...)` within the same tick. Reading the list
 * straight from config right after `setInstalledCommands` therefore returns the STALE value, which
 * left the post-scan `init` (and thus the panel) stuck on "No agents detected". Keeping a synchronous
 * cache here removes that race; we still persist to `yolo.installedCommands` for next-session startup.
 */
let installedCache: string[] | null = null;

export function getInstalledCommands(): string[] {
  if (installedCache) {
    return installedCache;
  }
  installedCache = cfg().get<string[]>("installedCommands", []);
  return installedCache;
}

export function setInstalledCommands(commands: string[]): void {
  installedCache = commands;
  cfg().update("installedCommands", commands, vscode.ConfigurationTarget.Global);
}

/**
 * Remembers the agent the user launched most recently, so the panel can
 * pre-select it next time. Persisted globally (like the other yolo.* settings).
 */
export function getLastAgentId(): string {
  return cfg().get<string>("lastAgentId", "");
}

export function setLastAgentId(id: string): void {
  cfg().update("lastAgentId", id, vscode.ConfigurationTarget.Global);
}

/**
 * Optional override for the shell used to launch agents (and to probe PATH). On Unix defaults to
 * `$SHELL`; on Windows auto-detects a POSIX shell (Git Bash / WSL) when unset. Accepts an absolute path
 * or a binary name on PATH.
 */
export function getShell(): string {
  return cfg().get<string>("shell", "") ?? "";
}

/** Extra argv inserted before `-lic` / `-NoProfile`, e.g. `["-l", "-i"]`. */
export function getShellArgs(): string[] {
  return cfg().get<string[]>("shellArgs", []);
}

/**
 * Recompute the installed agent set from a live PATH probe and persist it, so the
 * panel reflects the latest install state. Mirrors the `main` product's
 * cache-first + background-refresh behaviour:
 *
 *  - It runs without blocking activation (the probes are deferred), so the panel
 *    renders instantly from the persisted `installedCommands` and updates when
 *    this write lands (which fires `onDidChangeConfiguration` → re-render).
 *  - It is a FULL re-probe, not an append-only merge, so an agent uninstalled
 *    since the last run is dropped (pruned) rather than lingering — the same
 *    correctness guarantee `main` gets from rebuilding its cache each refresh.
 */
export async function syncInstalledAgents(
  promoted: { id: string; command: string }[],
  custom: UserAgentOverride[],
  canExecute: (cmd: string) => boolean
): Promise<void> {
  // Defer the per-command probes so activation isn't blocked; the panel shows the
  // cached set immediately and re-renders once this completes.
  await new Promise<void>((resolve) => setImmediate(resolve));

  const installed = new Set([
    ...promoted.filter((p) => canExecute(p.command)).map((p) => p.command.toLowerCase()),
    ...custom.filter((c) => canExecute(c.command)).map((c) => c.command.toLowerCase()),
  ]);
  setInstalledCommands(Array.from(installed));
}

/**
 * Last-known "latest version" for each agent command, persisted across sessions so the
 * manager panel can show the most recent detected version immediately (cache-first) before
 * the next network probe finishes. Keyed by lower-cased command. Only successful, non-empty
 * detections are written, so a transient probe failure never overwrites a good last-known value.
 */
let latestVersionsCache: Record<string, string> | null = null;

export function getLatestVersions(): Record<string, string> {
  if (latestVersionsCache) {
    return latestVersionsCache;
  }
  latestVersionsCache = cfg().get<Record<string, string>>("latestVersions", {});
  return latestVersionsCache;
}

export function getLatestVersion(command: string): string | undefined {
  return getLatestVersions()[command.trim().toLowerCase()];
}

/**
 * Merge the given command->version pairs into the persisted map. Existing entries are kept
 * when the new value is empty (so a failed probe never clobbers a known version). One batched
 * settings.json write per call.
 */
export function recordLatestVersions(updates: Record<string, string>): void {
  const merged = { ...getLatestVersions() };
  for (const [cmd, ver] of Object.entries(updates)) {
    if (!ver) continue; // never clobber a good last-known value with an empty detection
    merged[cmd.trim().toLowerCase()] = ver;
  }
  latestVersionsCache = merged;
  cfg().update("latestVersions", merged, vscode.ConfigurationTarget.Global);
}

/** Record a single agent's latest version (no-op when empty). */
export function recordLatestVersion(command: string, version: string): void {
  if (!version) return;
  recordLatestVersions({ [command]: version });
}

/**
 * Last-known *current* (installed) version for each agent command, persisted across sessions so
 * the manager panel can show it immediately (cache-first) before the next local probe. Keyed by
 * lower-cased command, with a timestamp (t) used for TTL eviction on the reader side. Stored as
 * {v, t} so a stale entry (older than the reader's TTL) is ignored when seeded.
 */
let currentVersionsCache: Record<string, { v: string; t: number }> | null = null;

export function getCurrentVersions(): Record<string, { v: string; t: number }> {
  if (currentVersionsCache) return currentVersionsCache;
  currentVersionsCache = cfg().get<Record<string, { v: string; t: number }>>("currentVersions", {});
  return currentVersionsCache;
}

export function recordCurrentVersions(updates: Record<string, { v: string; t: number }>): void {
  const merged = { ...getCurrentVersions() };
  for (const [cmd, entry] of Object.entries(updates)) {
    if (!entry?.v) continue; // never clobber a good last-known value with an empty detection
    merged[cmd.trim().toLowerCase()] = { v: entry.v, t: entry.t };
  }
  currentVersionsCache = merged;
  cfg().update("currentVersions", merged, vscode.ConfigurationTarget.Global);
}
