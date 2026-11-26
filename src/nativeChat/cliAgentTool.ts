// Runs an Agent YOLO CLI agent headlessly from VS Code native chat.
//
// The generated `.agent.md` files expose every catalog agent in the native chat
// agent picker. Each of those agents whitelists only this tool, so the harness
// delegates the real work to the user's installed CLI binary instead of
// answering from its own knowledge.

import * as vscode from "vscode";
import { spawn } from "child_process";
import { resolveAgents, AgentDef } from "../agents";
import { t } from "../l10n";

export const CLI_AGENT_TOOL_NAME = "agentyolo_runCliAgent";
const CONFIG_SECTION = "yolo.nativeChat";

interface RunCliAgentInput {
  agent: string;
  prompt: string;
}

/**
 * Non-interactive invocation args, verified from each CLI's --help or official
 * docs. Users can override per id via `yolo.nativeChat.agentCliArgs`.
 *
 * Agents absent from this table get no extra flags: the prompt is appended as a
 * plain positional argument, which is the common one-shot form for CLIs whose
 * headless mode was not verified.
 */
const DEFAULT_CLI_ARGS: Record<string, string> = {
  aider: "--message",          // aider-chat: aider --message "..."
  amp: "-p",
  autohand: "-p",
  aug: "--print",              // auggie --print "..."
  claude: "-p",
  codebuddy: "-p",
  codex: "exec",               // codex exec "..."
  "continue": "-p",            // cn -p "..." (headless)
  cursor: "-p",                // Cursor agent CLI
  dimcode: "exec",             // dim exec "..."
  droid: "exec",               // droid exec "..."
  goose: "run -t",             // goose run -t "..."
  grok: "-p",
  hermes: "chat -q",           // non-TTY makes -q answer and exit
  kimi: "-p",                  // kimi -p "..." (--prompt)
  kilo: "run",                 // kilo run "..."
  kiro: "chat --no-interactive",
  nova: "--print",
  opencode: "run",             // opencode run "..."
  pi: "-p",
  qodercn: "-p",
  "qwen-code": "-p",
  trae: "-p",                  // traecli -p "..."
  vtcode: "exec",              // vtcode exec "..."
};

/** Split a space-separated arg string, keeping double-quoted segments together. */
export function splitArgs(s: string | undefined): string[] {
  if (!s || !s.trim()) return [];
  const matches = s.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  return matches.map((part) => part.replace(/^"|"$/g, ""));
}

/** Remove ANSI colour/control sequences so the tool result is plain text. */
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g, "");
}

function result(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}

function findAgent(idOrCommand: string): AgentDef | undefined {
  const agents = resolveAgents();
  return agents.find((a) => a.id === idOrCommand || a.command === idOrCommand);
}

function config<T>(key: string, fallback: T): T {
  return vscode.workspace.getConfiguration(CONFIG_SECTION).get<T>(key) ?? fallback;
}

function buildArgs(agent: AgentDef, prompt: string): string[] {
  const overrides = config<Record<string, string>>("agentCliArgs", {});
  const modeArgs = overrides[agent.id] ?? DEFAULT_CLI_ARGS[agent.id] ?? "";
  const args = [...splitArgs(agent.baseArgs), ...splitArgs(modeArgs)];
  if (config<boolean>("autoApprove", false) && agent.skipFlag) {
    args.push(...splitArgs(agent.skipFlag));
  }
  args.push(prompt);
  return args;
}

/** Spawn the CLI without a PTY and collect its output, with timeout and cancellation. */
function run(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  maxChars: number,
  token: vscode.CancellationToken
): Promise<string> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        shell: false,
        windowsHide: true,
        env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", TERM: "dumb" },
      });
    } catch (e) {
      resolve(`Could not start \`${command}\`: ${String(e)}`);
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let cancelled = false;

    const finish = (prefix?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const tail = [
        prefix,
        stripAnsi(stdout).trimEnd(),
        stderr.trim() ? `--- stderr ---\n${stripAnsi(stderr).trimEnd()}` : "",
      ]
        .filter(Boolean)
        .join("\n")
        .trim();
      resolve(tail || "(the CLI produced no output)");
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      finish(`[timed out after ${Math.round(timeoutMs / 1000)}s]`);
    }, timeoutMs);

    const sub = token.onCancellationRequested(() => {
      cancelled = true;
      child.kill();
      finish("[cancelled]");
    });

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
      if (stdout.length + stderr.length > maxChars) {
        child.kill();
        finish(`[output capped at ${maxChars} characters]`);
      }
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
      if (stdout.length + stderr.length > maxChars) {
        child.kill();
        finish(`[output capped at ${maxChars} characters]`);
      }
    });
    child.on("error", (e: NodeJS.ErrnoException) => {
      const hint =
        e.code === "ENOENT"
          ? ` \`${command}\` was not found on PATH. Install it first (Agent YOLO can do this from its Manage Agents page).`
          : "";
      finish(`Could not start \`${command}\`: ${e.message}.${hint}`);
    });
    child.on("close", (code: number | null) => {
      sub.dispose();
      if (settled) return;
      const prefix = timedOut || cancelled ? undefined : code === 0 ? undefined : `[exit code ${code}]`;
      finish(prefix);
    });
  });
}

class CliAgentTool implements vscode.LanguageModelTool<RunCliAgentInput> {
  prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<RunCliAgentInput>) {
    const agent = findAgent(options.input.agent);
    const name = agent?.displayName ?? options.input.agent ?? "CLI agent";
    const auto = config<boolean>("autoApprove", true);
    return {
      invocationMessage: t("nativeChat.invocation", name),
      // When the CLI's own approvals are bypassed, say so in the confirmation
      // dialog so the user knows what the Allow button actually authorizes.
      ...(auto
        ? {
            confirmationMessages: {
              title: t("nativeChat.confirm.title", name),
              message: t("nativeChat.confirm.message"),
            },
          }
        : {}),
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<RunCliAgentInput>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const requested = (options.input?.agent ?? "").trim();
    const prompt = (options.input?.prompt ?? "").trim();
    if (!requested) return result("Error: no agent was specified.");
    if (!prompt) return result("Error: the prompt is empty.");

    const agent = findAgent(requested);
    if (!agent) {
      const available = resolveAgents()
        .map((a) => a.id)
        .join(", ");
      return result(`Unknown agent "${requested}". Available agents: ${available}`);
    }

    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    const timeoutMs = Math.max(5000, config<number>("timeoutSeconds", 180) * 1000);
    const maxChars = Math.max(1000, config<number>("maxOutputChars", 30000));
    const args = buildArgs(agent, prompt);

    const output = await run(agent.command, args, cwd, timeoutMs, maxChars, token);
    return result(`[${agent.displayName} / ${agent.command}]\n${output}`);
  }
}

/**
 * Register the tool that backs all generated `.agent.md` agents.
 *
 * `lm.registerTool` and the `chatAgents` contribution only exist in newer VS
 * Code. Older versions ignore the unknown contribution points, so we must skip
 * the registration too — otherwise activation would throw and break the panel.
 * This keeps the extension installable and fully usable from 1.85 onwards.
 */
export function registerCliAgentTool(context: vscode.ExtensionContext): void {
  if (typeof vscode.lm?.registerTool !== "function") return;
  context.subscriptions.push(
    vscode.lm.registerTool(CLI_AGENT_TOOL_NAME, new CliAgentTool())
  );
}
