"use strict";
(() => {
  // src/webview/settings.ts
  var vscode = acquireVsCodeApi();
  var state = {
    agents: []
  };
  var selectedId = null;
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }
  function slug(s) {
    return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "tool";
  }
  function baseName(cmd) {
    return cmd.replace(/^.*[\\/]/, "");
  }
  function collectRows() {
    return Array.from(document.querySelectorAll(".arow")).map((row) => ({
      id: row.querySelector("input[data-f='id']")?.value.trim() ?? "",
      command: row.querySelector("input[data-f='command']")?.value.trim() ?? ""
    }));
  }
  function findDuplicates() {
    const ids = /* @__PURE__ */ new Map();
    const cmds = /* @__PURE__ */ new Map();
    const dupIds = /* @__PURE__ */ new Set();
    const dupCmds = /* @__PURE__ */ new Set();
    for (const r of collectRows()) {
      const id = r.id.toLowerCase();
      const cmd = baseName(r.command).toLowerCase();
      if (id) {
        if (ids.has(id)) {
          dupIds.add(id);
        }
        ids.set(id, (ids.get(id) ?? 0) + 1);
      }
      if (cmd) {
        if (cmds.has(cmd)) {
          dupCmds.add(cmd);
        }
        cmds.set(cmd, (cmds.get(cmd) ?? 0) + 1);
      }
    }
    const problems = [];
    if (dupIds.size > 0) {
      problems.push("Duplicate ID: " + Array.from(dupIds).join(", "));
    }
    if (dupCmds.size > 0) {
      problems.push("Duplicate command: " + Array.from(dupCmds).join(", "));
    }
    return problems;
  }
  function reportDuplicates() {
    const problems = findDuplicates();
    if (problems.length > 0) {
      setStatus(problems.join("; "), true);
    } else if (document.getElementById("status")?.className === "warn") {
      setStatus("", false);
    }
  }
  function iconMarkup(a) {
    const cls = a.installed ? "ai" : "ai missing";
    return a.iconUri ? `<img class="${cls}" src="${escapeAttr(a.iconUri)}" alt="" draggable="false" />` : `<span class="${cls}">\u26A1</span>`;
  }
  function render() {
    const root = document.getElementById("root");
    const selLocked = state.agents.find((a) => a.id === selectedId)?.locked ?? false;
    const rows = state.agents.map((a) => {
      const icon = iconMarkup(a);
      const dis = a.locked ? "disabled" : "";
      return `<div class="arow${a.id === selectedId ? " sel" : ""}${a.locked ? " locked" : ""}" data-id="${escapeAttr(a.id)}">
        <div class="aiwrap">${icon}</div>
        <input data-f="id" value="${escapeAttr(a.id)}" ${dis} />
        <input data-f="displayName" value="${escapeAttr(a.displayName)}" ${dis} />
        <input data-f="command" value="${escapeAttr(a.command)}" ${dis} />
        <input data-f="baseArgs" value="${escapeAttr(a.baseArgs)}" />
        <input data-f="skipFlag" value="${escapeAttr(a.skipFlag)}" />
        <input data-f="resumeFlag" value="${escapeAttr(a.resumeFlag)}" />
        <input data-f="iconFile" value="${escapeAttr(a.iconFile)}" ${dis} />
      </div>`;
    }).join("");
    root.innerHTML = `
    <div class="head">
      <span>Icon</span><span>ID</span><span>Display name</span><span>Command</span>
      <span>Base args</span><span>Skip flag</span><span>Resume flag</span><span>Icon file</span>
    </div>
    <div class="arows">${rows}</div>
    <div class="actions">
      <button id="addTool">+ Add</button>
      <button id="removeTool">\u2212 Remove</button>
      <button id="pickIconBtn" type="button" title="Choose icon for the selected agent"${selLocked ? " disabled" : ""}>Icon\u2026</button>
      <span id="status"></span>
      <button id="save" class="primary">Save</button>
    </div>`;
    document.getElementById("save").addEventListener("click", save);
    document.getElementById("addTool").addEventListener("click", addTool);
    document.getElementById("removeTool").addEventListener("click", removeTool);
    document.getElementById("pickIconBtn").addEventListener("click", pickSelectedIcon);
    updateIconBtnState();
    root.querySelectorAll(".arow").forEach((row) => {
      row.addEventListener("click", (e) => {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "BUTTON") {
          return;
        }
        selectedId = row.dataset.id ?? null;
        root.querySelectorAll(".arow").forEach((r) => r.classList.remove("sel"));
        row.classList.add("sel");
        updateIconBtnState();
      });
    });
    root.querySelector(".arows")?.addEventListener("input", reportDuplicates);
    reportDuplicates();
  }
  function syncFromDom() {
    const byId = new Map(state.agents.map((a) => [a.id, a]));
    document.querySelectorAll(".arow").forEach((row) => {
      const id = row.dataset.id ?? "";
      const a = byId.get(id);
      if (!a) {
        return;
      }
      const get = (f) => row.querySelector(`input[data-f='${f}']`)?.value ?? "";
      if (!a.locked) {
        a.id = get("id").trim();
      }
      a.displayName = get("displayName").trim();
      a.command = get("command").trim();
      a.baseArgs = get("baseArgs").trim();
      a.skipFlag = get("skipFlag").trim();
      a.resumeFlag = get("resumeFlag").trim();
      a.iconFile = get("iconFile").trim();
    });
  }
  function addTool() {
    syncFromDom();
    const id = `custom.${slug("tool" + (state.agents.length + 1))}`;
    state.agents.push({
      id,
      displayName: "",
      command: "",
      baseArgs: "",
      iconFile: "",
      skipFlag: "",
      resumeFlag: "",
      locked: false,
      installed: false
    });
    selectedId = id;
    render();
  }
  function removeTool() {
    syncFromDom();
    if (!selectedId) {
      setStatus("Select a row first", true);
      return;
    }
    const target = state.agents.find((a) => a.id === selectedId);
    if (target?.locked) {
      setStatus(`Cannot remove built-in agent "${target.id}"`, true);
      return;
    }
    state.agents = state.agents.filter((a) => a.id !== selectedId);
    selectedId = null;
    render();
  }
  function updateIconBtnState() {
    const btn = document.getElementById("pickIconBtn");
    if (!btn) {
      return;
    }
    const a = state.agents.find((x) => x.id === selectedId);
    btn.disabled = Boolean(a?.locked);
  }
  function pickSelectedIcon() {
    if (!selectedId) {
      setStatus("Select a row first", true);
      return;
    }
    const a = state.agents.find((x) => x.id === selectedId);
    if (a?.locked) {
      setStatus(`Built-in agent "${a.id}" can't change its icon`, true);
      return;
    }
    vscode.postMessage({ type: "pickIcon", rowId: selectedId });
  }
  function setStatus(text, warn) {
    const el = document.getElementById("status");
    if (el) {
      el.textContent = text;
      el.className = warn ? "warn" : "";
    }
  }
  function save() {
    syncFromDom();
    const problems = findDuplicates();
    if (problems.length > 0) {
      setStatus(problems.join("; "), true);
      return;
    }
    const agents = state.agents.map((a) => ({
      id: a.id,
      displayName: a.displayName,
      command: a.command,
      baseArgs: a.baseArgs,
      iconFile: a.iconFile,
      skipFlag: a.skipFlag,
      resumeFlag: a.resumeFlag,
      locked: a.locked,
      installed: a.installed,
      iconUri: a.iconUri
    }));
    vscode.postMessage({ type: "save", agents });
    setStatus("Saving\u2026", false);
  }
  function applyInstalled(installedCmds) {
    const set = new Set(installedCmds.map((c) => c.toLowerCase()));
    document.querySelectorAll(".arow").forEach((row) => {
      const id = row.dataset.id ?? "";
      const a = state.agents.find((x) => x.id === id);
      if (!a) {
        return;
      }
      const ok = a.command.trim().length > 0 && set.has(a.command.toLowerCase());
      a.installed = ok;
      row.querySelector(".ai")?.classList.toggle("missing", !ok);
    });
  }
  window.addEventListener("message", (ev) => {
    const msg = ev.data;
    if (msg.type === "config") {
      state = msg.state;
      if (!selectedId || !state.agents.some((a) => a.id === selectedId)) {
        selectedId = state.agents.find((a) => !a.locked)?.id ?? state.agents[0]?.id ?? null;
      }
      render();
    } else if (msg.type === "installed") {
      applyInstalled(msg.installed ?? []);
    } else if (msg.type === "saveResult") {
      if (msg.ok) {
        const warns = Array.isArray(msg.warnings) ? msg.warnings : [];
        if (warns.length > 0) {
          setStatus("Saved \u2713 \u2014 " + warns.join("; "), true);
        } else {
          setStatus("Saved \u2713", false);
          setTimeout(() => setStatus("", false), 1500);
        }
      } else {
        setStatus(msg.message ?? "Save failed", true);
      }
    } else if (msg.type === "iconChosen") {
      const a = state.agents.find((x) => x.id === msg.rowId);
      if (!a) {
        return;
      }
      a.iconFile = msg.value;
      a.iconUri = msg.iconUri;
      const row = Array.from(document.querySelectorAll(".arow")).find(
        (r) => r.dataset.id === msg.rowId
      );
      if (row) {
        const input = row.querySelector("input[data-f='iconFile']");
        if (input) {
          input.value = msg.value;
        }
        row.querySelector(".aiwrap").innerHTML = iconMarkup(a);
      }
    }
  });
  vscode.postMessage({ type: "ready" });
})();
//# sourceMappingURL=settings.js.map
