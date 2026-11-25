// Guards the generated native-chat integration against drift: every catalog
// agent must have a matching .agent.md + chatAgents contribution, the tool
// reference must match the contribution's toolReferenceName, and every nls
// placeholder used by package.json must resolve in both locale files.
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const catalog = JSON.parse(read("agents.json"));
const pkg = JSON.parse(read("package.json"));
const agents = (Array.isArray(catalog) ? catalog : catalog.agents) || [];
const idOf = (a) => a.id || a.command;
const contextKey = (id) => `yolo.agentInstalled.${id.replace(/[^a-zA-Z0-9]/g, "_")}`;
const TOOL = "cnsharp.agentyolo/runCliAgent";
// Keep in sync with EXCLUDED_IDS in scripts/generate-native-chat-agents.cjs.
const EXCLUDED_IDS = new Set(["copilot", "agoragentic", "deepagents", "glm-agent"]);

test("every catalog agent has a generated .agent.md and a chatAgents entry", () => {
  const seen = new Set();
  for (const agent of agents) {
    const id = idOf(agent);
    if (!id || seen.has(id) || EXCLUDED_IDS.has(id)) continue;
    seen.add(id);
    const file = `agents/${id}.agent.md`;
    assert.ok(fs.existsSync(path.join(root, file)), `missing ${file}`);
    assert.ok(
      pkg.contributes.chatAgents.some((entry) => entry.path === `./${file}`),
      `missing chatAgents entry for ${id}`
    );
  }
  assert.strictEqual(pkg.contributes.chatAgents.length, seen.size);
});

test("chatAgents entries use the installed context key and the real tool reference", () => {
  for (const entry of pkg.contributes.chatAgents) {
    const id = path.basename(entry.path, ".agent.md");
    assert.strictEqual(entry.when, contextKey(id), `bad when for ${id}`);
    const body = read(entry.path.replace(/^\.\//, ""));
    assert.ok(body.includes(`tools: ['${TOOL}']`), `bad tool reference in ${id}`);
    assert.ok(body.includes(`agent: "${id}"`), `bad agent id in body of ${id}`);
  }
});

test("tool contribution matches the reference used by generated agents", () => {
  const tool = pkg.contributes.languageModelTools.find((t) => t.name === "agentyolo_runCliAgent");
  assert.ok(tool, "languageModelTools contribution missing");
  assert.strictEqual(tool.toolReferenceName, TOOL.split("/")[1]);
  assert.strictEqual(tool.canBeReferencedInPrompt, true);
});

test("every nls placeholder in package.json resolves in both locale files", () => {
  const en = JSON.parse(read("package.nls.json"));
  const zh = JSON.parse(read("package.nls.zh-cn.json"));
  const keys = new Set();
  for (const m of read("package.json").matchAll(/%([\w.]+)%/g)) keys.add(m[1]);
  assert.ok(keys.size > 0);
  for (const key of keys) {
    assert.ok(Object.hasOwn(en, key), `package.nls.json missing ${key}`);
    assert.ok(Object.hasOwn(zh, key), `package.nls.zh-cn.json missing ${key}`);
  }
});
