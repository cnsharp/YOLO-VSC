// Agent Manager page script: renders the card grid from the host's `init` payload and applies
// incremental `agentUpdate` / `busy` / `result` / `checking` messages as checks and installs
// progress. All actions are posted back to the host, which owns the install / version services.

const vscode = acquireVsCodeApi();

interface AgentCard {
  id: string;
  displayName: string;
  command: string;
  iconUri?: string;
  platforms: string;
  installed: boolean;
  url?: string;
  status: string;
  current: string;
  latest: string;
  error?: string;
  canInstall: boolean;
  canUpgrade: boolean;
  busy?: string;
}

let cards: AgentCard[] = [];
let checking = false;

const grid = document.getElementById("grid") as HTMLDivElement;
const empty = document.getElementById("empty") as HTMLDivElement;
const refreshBtn = document.getElementById("refresh") as HTMLButtonElement;
const upgradeAllBtn = document.getElementById("upgradeAll") as HTMLButtonElement;

refreshBtn.addEventListener("click", () => vscode.postMessage({ type: "refresh" }));
upgradeAllBtn.addEventListener("click", () => vscode.postMessage({ type: "upgradeAll" }));

window.addEventListener("message", (e: MessageEvent) => {
  const msg = e.data ?? {};
  switch (msg.type) {
    case "init":
      cards = msg.agents ?? [];
      render();
      break;
    case "agentUpdate": {
      const c = cards.find((x) => x.id === msg.agentId);
      if (c) {
        c.status = msg.status;
        c.current = msg.current ?? "";
        c.latest = msg.latest ?? "";
        c.error = msg.error;
        c.installed = c.installed || !!msg.current || msg.status === "UP_TO_DATE" || msg.status === "UPDATE_AVAILABLE" || msg.status === "MANUAL";
        render();
      }
      break;
    }
    case "busy": {
      const c = cards.find((x) => x.id === msg.agentId);
      if (c) {
        c.busy = msg.busy ? msg.label ?? "working…" : undefined;
        render();
      }
      break;
    }
    case "checking":
      checking = !!msg.checking;
      refreshBtn.disabled = checking;
      render();
      break;
  }
});

function upgradableCount(): number {
  return cards.filter((c) => c.status === "UPDATE_AVAILABLE" && c.canUpgrade && !c.busy).length;
}

function render(): void {
  upgradeAllBtn.textContent = upgradableCount() > 0 ? `Upgrade All (${upgradableCount()})` : "Upgrade All";
  upgradeAllBtn.disabled = checking || upgradableCount() === 0;
  empty.hidden = cards.length > 0;
  grid.replaceChildren(...cards.map(cardEl));
}

function cardEl(c: AgentCard): HTMLElement {
  const card = document.createElement("div");
  card.className = "card";

  // --- head: icon + name + platform chip + badge/warn ---
  const head = document.createElement("div");
  head.className = "head";
  const logo = document.createElement(c.iconUri ? "img" : "div");
  if (c.iconUri) {
    (logo as HTMLImageElement).className = "logo";
    (logo as HTMLImageElement).src = c.iconUri;
  } else {
    logo.className = "logo fallback";
    logo.textContent = "⌁";
  }
  const names = document.createElement("div");
  names.className = "names";
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = c.displayName;
  const chip = document.createElement("span");
  chip.className = "chip";
  chip.textContent = c.platforms;
  names.append(name, chip);
  head.append(logo, names);
  if (c.status === "UPDATE_AVAILABLE") {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "upgradable";
    head.append(badge);
  } else if (c.status === "ERROR" || (!c.installed && c.status !== "CHECKING")) {
    const warn = document.createElement("span");
    warn.className = "warn";
    warn.textContent = "⚠";
    head.append(warn);
  }

  // --- version rows ---
  const rows = document.createElement("div");
  rows.className = "rows";
  rows.append(
    versionRow("Current version", c),
    versionRow("Latest version", c, true)
  );
  if (c.error) {
    const err = document.createElement("div");
    err.className = "error";
    err.textContent = c.error;
    rows.append(err);
  }

  // --- action buttons ---
  const actions = document.createElement("div");
  actions.className = "actions";
  if (c.busy) {
    const b = document.createElement("button");
    b.disabled = true;
    const s = document.createElement("span");
    s.className = "spinner";
    b.append(s, document.createTextNode(c.busy));
    actions.append(b);
  } else {
    if (c.status === "UPDATE_AVAILABLE" && c.canUpgrade) {
      actions.append(actionBtn("Upgrade", true, () => vscode.postMessage({ type: "upgrade", agentId: c.id })));
    } else if (!c.installed && c.canInstall) {
      actions.append(actionBtn("Install", false, () => vscode.postMessage({ type: "install", agentId: c.id })));
    } else if (c.installed && c.canUpgrade && c.status !== "CHECKING" && c.status !== "UP_TO_DATE") {
      // Installed but the version pair couldn't be compared (MANUAL / ERROR): offer the
      // agent's own update command anyway.
      actions.append(actionBtn("Upgrade", false, () => vscode.postMessage({ type: "upgrade", agentId: c.id })));
    }
    if (c.url) {
      actions.append(actionBtn("Open site", false, () => vscode.postMessage({ type: "openUrl", url: c.url })));
    }
  }

  card.append(head, rows, actions);
  return card;
}

function versionRow(label: string, c: AgentCard, latest = false): HTMLElement {
  const row = document.createElement("div");
  row.className = "row";
  const k = document.createElement("span");
  k.className = "k";
  k.textContent = label;
  const v = document.createElement("span");
  v.className = "v";
  if (latest) {
    // The latest-version column is only meaningful for queryable package sources.
    v.textContent = c.status === "CHECKING" ? "loading…" : c.latest || (c.status === "MANUAL" ? "—" : c.latest || "—");
    if (v.textContent === "loading…") v.classList.add("loading");
  } else {
    v.textContent = c.status === "CHECKING" && !c.current ? "loading…" : c.current || (c.installed ? "unknown" : "not installed");
    if (v.textContent === "loading…") v.classList.add("loading");
  }
  row.append(k, v);
  return row;
}

function actionBtn(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  if (primary) b.className = "primary";
  b.addEventListener("click", onClick);
  return b;
}

vscode.postMessage({ type: "ready" });
