// Agent detection: can the command actually be executed?
//
// Detection now resolves commands via the FILESYSTEM (not by spawning a login
// shell per agent). The old approach ran `execSync("$SHELL -lc 'command -v …'")`
// once per agent during `sendInit` — serially, on the extension-host thread —
// which on a slow machine (and on Windows) meant dozens of blocking shell
// spawns and a multi-second freeze, so the webview's `init` arrived late and
// tripped the "agent list failed to load" error even though it eventually
// succeeded.
//
// The filesystem scan below mirrors the proven detection in the sibling
// ai-agents-terminal-vsc product: it looks in well-known install dirs
// (nvm/fnm/Homebrew/volta/.local/.codebuddy) plus the current process PATH
// using `fs.statSync`. That is near-instant, shell/profile-independent (so a
// GUI-launched VS Code — which starts with a minimal PATH — still finds agents
// installed under nvm/fnm/brew), and never blocks the host.

import * as os from "os";
import * as fs from "fs";
import * as path from "path";

/**
 * Candidate bin directories where AI-agent CLIs are commonly installed,
 * resolved via the filesystem (not the shell) so detection does NOT depend on
 * the user's shell having loaded them onto PATH. A GUI-launched VS Code
 * (Dock/Spotlight) starts the extension host with a minimal environment, and
 * its spawned login shell often does NOT read the rc files that inject
 * nvm/fnm/brew/npm-global — which is why shell-based probing missed agents.
 */
function candidateBinDirs(): string[] {
  const home = os.homedir();
  const dirs: string[] = [
    "/opt/homebrew/bin", // Apple-Silicon Homebrew
    "/usr/local/bin", // Intel Homebrew / manual installs
    path.join(home, ".local", "bin"),
    path.join(home, ".codebuddy", "bin"),
    path.join(home, ".volta", "bin"),
  ];

  // nvm: pick the latest installed node version's bin.
  const nvmBase = path.join(home, ".nvm", "versions", "node");
  try {
    const vers = fs
      .readdirSync(nvmBase)
      .filter((n) => /^v?\d/.test(n))
      .sort()
      .reverse();
    if (vers.length) dirs.push(path.join(nvmBase, vers[0], "bin"));
  } catch {
    /* no nvm */
  }

  // fnm: each version lives under <root>/<version>/installation/bin.
  const fnmBase = path.join(home, ".fnm", "node-versions");
  try {
    for (const v of fs.readdirSync(fnmBase).filter((n) => /^v?\d/.test(n))) {
      dirs.push(path.join(fnmBase, v, "installation", "bin"));
    }
  } catch {
    /* no fnm */
  }

  // Keep only directories that actually exist (avoids polluting the search).
  return dirs.filter((d) => {
    try {
      return fs.statSync(d).isDirectory();
    } catch {
      return false;
    }
  });
}

/** The single source of truth for where agents may live: the well-known
 *  install dirs (nvm/fnm/Homebrew/volta/…), the standard system bindirs, and
 *  the current process PATH. Both detection (`findExecutablePath`) and the
 *  launched terminal's PATH (`boostedPath`) derive from this list, so they can
 *  never drift apart. De-duplicated, order-preserving.
 *
 *  Memoized: PATH does not change within an extension-host session, and this
 *  list is read once per `findExecutablePath` call (so ~N times on the first
 *  `sendInit` before the per-command cache fills). Computing it once avoids
 *  repeating the `readdirSync` probes on nvm/fnm on every agent. */
let searchDirsCache: string[] | undefined;
export function searchDirs(): string[] {
  if (searchDirsCache) {
    return searchDirsCache;
  }
  const raw = [
    ...candidateBinDirs(),
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    ...(process.env.PATH ? process.env.PATH.split(path.delimiter) : []),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of raw) {
    if (d && !seen.has(d)) {
      seen.add(d);
      out.push(d);
    }
  }
  searchDirsCache = out;
  return out;
}

/** Find the absolute path of an installed agent command, or undefined. */
export function findExecutablePath(command: string): string | undefined {
  const cmd = command.trim();
  if (cmd.length === 0) {
    return undefined;
  }
  const exts =
    process.platform === "win32"
      ? [".exe", ".cmd", ".bat", ".ps1", ""]
      : [""];

  for (const dir of searchDirs()) {
    if (!dir) continue;
    for (const ext of exts) {
      const full = path.join(dir, cmd + ext);
      try {
        const st = fs.statSync(full);
        if (!st.isFile()) continue;
        // On POSIX the file must be executable.
        if (process.platform !== "win32" && (st.mode & 0o111) === 0) continue;
        return full;
      } catch {
        /* not in this dir */
      }
    }
  }
  return undefined;
}

/**
 * The `PATH` string for the launched terminal, derived from `searchDirs()` so it
 * is exactly the dirs we detect against. This ensures (a) the agent's own
 * `#!/usr/bin/env node` shebang resolves node, and (b) the agent's tooling is on
 * PATH. Without it, a GUI-launched VS Code terminal has a minimal PATH and the
 * launched agent can't find node / its dependencies.
 */
export function boostedPath(): string {
  return searchDirs().join(path.delimiter);
}

// Detection results are cached for the lifetime of the extension host. The same
// command is probed repeatedly — once per `sendInit` (the webview re-requests
// `init` via the watchdog loop, and re-shows the panel), and again per agent in
// the settings + picker filters — so caching keeps repeated loads near-instant
// and stops a slow machine from re-scanning on every request.
const cache = new Map<string, string | undefined>();

function cachedResolve(command: string): string | undefined {
  if (cache.has(command)) {
    return cache.get(command);
  }
  const result = findExecutablePath(command);
  cache.set(command, result);
  return result;
}

/** Resolve the command's absolute path (for display). Returns undefined if not found. */
export function resolvePath(command: string): string | undefined {
  return cachedResolve(command);
}

/** Whether the command can actually be executed — resolvable to an executable file. */
export function canExecute(command: string): boolean {
  return cachedResolve(command) !== undefined;
}
