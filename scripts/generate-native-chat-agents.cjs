// Generates one VS Code custom-agent (.agent.md) per catalog entry so every
// Agent YOLO CLI agent can be selected in VS Code's native chat. The agent body
// is a thin router: it forces the harness to delegate the whole request to the
// real CLI binary through the `agentyolo_runCliAgent` language model tool.
//
// Run after agents.json changes:  node scripts/generate-native-chat-agents.cjs

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "agents.json"), "utf8"));
const agents = Array.isArray(catalog) ? catalog : catalog.agents;
if (!Array.isArray(agents)) throw new Error("agents.json: expected an array or a v2 { agents: [...] } envelope");

// Full reference name = `${extensionId.toLowerCase()}/${toolReferenceName}`.
// `toolReferenceName` (runCliAgent) is NOT the tool's `name` (agentyolo_runCliAgent),
// which is only used by lm.registerTool in the implementation.
const TOOL = "cnsharp.agentyolo/runCliAgent";
// Copilot is already the built-in/harness default in VS Code Chat; contributing
// another agent with that name would only duplicate it in the picker.
// The other three are ACP/MCP servers, not prompt-taking CLIs: they speak a
// stdio protocol to an editor client and cannot run `cli <prompt>` at all.
const EXCLUDED_IDS = new Set(["copilot", "agoragentic", "deepagents", "glm-agent"]);
const outDir = path.join(root, "agents");
fs.mkdirSync(outDir, { recursive: true });

const entries = [];
const seen = new Set();
for (const agent of agents) {
  const id = agent.id || agent.command;
  if (!id || seen.has(id) || EXCLUDED_IDS.has(id)) continue;
  seen.add(id);

  const name = String(agent.displayName || id);
  const command = String(agent.command || id);
  const q = (s) => JSON.stringify(String(s));

  const body = [
    "---",
    `name: ${q(name)}`,
    `description: ${q(`Route a coding task to the ${name} CLI agent (${command}) and return its real output.`)}`,
    `tools: ['${TOOL}']`,
    "---",
    "",
    `You are a thin router to the **${name}** CLI agent (\`${command}\`).`,
    "",
    "For EVERY user request:",
    `1. Call tool \`${TOOL}\` with \`agent: ${q(id)}\` and \`prompt\` set to the user's full request, verbatim.`,
    "2. Return the tool's output to the user unchanged.",
    "",
    "Do not answer from your own knowledge, do not edit files yourself, and do not call any other tool.",
    "If the tool reports an error (for example the CLI is not installed), relay that error verbatim.",
    "",
  ].join("\n");

  const file = path.join(outDir, `${id}.agent.md`);
  fs.writeFileSync(file, body, "utf8");
  // Hyphens are unsafe in `when` expressions; keep this in sync with
  // agentContextKey() in src/nativeChat/agentAvailability.ts.
  const contextKey = id.replace(/[^a-zA-Z0-9]/g, "_");
  entries.push({ path: `./agents/${id}.agent.md`, when: `yolo.agentInstalled.${contextKey}` });
}

const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.contributes = pkg.contributes || {};
pkg.contributes.chatAgents = entries;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

console.log(`Generated ${entries.length} custom agents in agents/ and wired contributes.chatAgents.`);
