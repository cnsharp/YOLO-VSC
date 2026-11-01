// node-pty's embedded PTY backend can be silently disabled on macOS, forcing the extension to
// fall back to a real VS Code terminal. Two independent packaging gotchas cause this, both fixed
// here at install/build time so the fix is reproducible on every machine AND in the published
// .vsix (vsce runs `vscode:prepublish` -> `build` -> this script):
//
//   1. npm/tar can extract the prebuilt `spawn-helper` without the executable bit, so the OS
//      rejects the spawn with `posix_spawnp failed`.
//   2. node-pty's prebuilt `pty.node` ships COMPLETELY UNSIGNED. Newer VS Code (Electron hardened
//      runtime + library validation) refuses to `dlopen` it — `require("node-pty")` throws
//      "mapped file has no cdhash, completely unsigned? Code has to be at least ad-hoc signed"
//      — which also lands the embedded terminal in the vscode-terminal fallback.
//
// Ad-hoc signing (`codesign -s -`) satisfies Electron's check without a Developer ID. This only
// matters on macOS; on other platforms it is a no-op.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

if (process.platform !== "darwin") {
  process.exit(0);
}

const base = path.join(__dirname, "..", "node_modules", "node-pty", "prebuilds");
if (!fs.existsSync(base)) {
  process.exit(0);
}

const TARGETS = new Set(["pty.node", "spawn-helper"]);

let signed = 0;
for (const dir of fs.readdirSync(base)) {
  if (!dir.startsWith("darwin")) {
    continue;
  }
  const d = path.join(base, dir);
  for (const f of fs.readdirSync(d)) {
    if (!TARGETS.has(f)) {
      continue;
    }
    const file = path.join(d, f);
    // Best-effort: the helper must be executable; the .node is loaded either way.
    try {
      fs.chmodSync(file, 0o755);
    } catch {
      /* ignore */
    }
    try {
      execFileSync("codesign", ["--force", "-s", "-", file], { stdio: "ignore" });
      signed++;
    } catch (e) {
      console.warn(`[ensure-node-pty] could not ad-hoc sign ${file}: ${e.message}`);
    }
  }
}

if (signed > 0) {
  console.log(`[ensure-node-pty] ad-hoc signed ${signed} node-pty native binary(ies) for macOS.`);
}