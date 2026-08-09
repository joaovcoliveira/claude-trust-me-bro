#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

// Resolved once, and always through fileURLToPath: `new URL(...).pathname` keeps
// the URL percent-encoding, so an install path containing a space comes back as
// "/Users/me/Library/Application%20Support/..." — a path that does not exist on
// disk. Both the hook command we write and the check that recognises it later
// have to agree, so they share this one value.
const CLI_PATH = fs.realpathSync(fileURLToPath(import.meta.url));

const SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");
const LOCAL_SETTINGS_PATH = path.join(
  os.homedir(),
  ".claude",
  "settings.local.json"
);
const MODE_PATH = path.join(os.homedir(), ".claude", "tmb.json");

// Approval modes:
//   full         — trust me bro, auto-approve absolutely everything (default)
//   conservative — auto-approve permission prompts, but let multiple-choice
//                  questions through so you can answer them yourself
const MODES = ["full", "conservative"];
const DEFAULT_MODE = "full";

// PreToolUse hook response — skips the permission prompt
const PRE_TOOL_ALLOW = JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "allow",
    permissionDecisionReason: "Auto-approved by claude-trust-me-bro",
  },
});

// PermissionRequest hook response — approves the "Do you want to proceed?" prompt
const PERMISSION_ALLOW = JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PermissionRequest",
    decision: { behavior: "allow" },
  },
});

// Tools we never auto-approve. These present an actual choice to the human
// (multiple-choice questions), so silently approving them would rob you of the
// chance to answer. Let Claude Code fall back to asking you normally.
const NEVER_AUTO_APPROVE = new Set(["AskUserQuestion"]);

function readStdinJson(chunks) {
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    return {};
  }
}

function readMode() {
  const mode = readJson(MODE_PATH).mode;
  return MODES.includes(mode) ? mode : DEFAULT_MODE;
}

function setMode(mode) {
  const config = readJson(MODE_PATH);
  config.mode = mode;
  writeJson(MODE_PATH, config);
}

// Broad allow rules for settings.local.json
const ALLOW_RULES = [
  "Bash(*)",
  "Read(*)",
  "Write(*)",
  "Edit(*)",
  "Glob(*)",
  "Grep(*)",
  "WebFetch(*)",
  "WebSearch(*)",
  "NotebookEdit(*)",
  "mcp__*",
];

function getHookCommand(subcommand) {
  return `node "${CLI_PATH}" ${subcommand}`;
}

function isOurEntry(entry) {
  const check = (str) => str?.includes(CLI_PATH);
  if (entry.hooks?.some((h) => check(h.command))) return true;
  if (check(entry.command)) return true;
  return false;
}

function readJson(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, "utf-8"));
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

function writeJson(filepath, data) {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

function upsertHook(settings, eventName, hookCommand) {
  if (!settings.hooks) settings.hooks = {};
  if (!Array.isArray(settings.hooks[eventName]))
    settings.hooks[eventName] = [];

  const idx = settings.hooks[eventName].findIndex(isOurEntry);
  const hookEntry = {
    hooks: [{ type: "command", command: hookCommand }],
  };

  if (idx >= 0) {
    settings.hooks[eventName][idx] = hookEntry;
  } else {
    settings.hooks[eventName].push(hookEntry);
  }
}

function removeHook(settings, eventName) {
  if (!settings.hooks?.[eventName]) return;
  const filtered = settings.hooks[eventName].filter(
    (entry) => !isOurEntry(entry)
  );
  if (filtered.length === 0) {
    delete settings.hooks[eventName];
  } else {
    settings.hooks[eventName] = filtered;
  }
  if (settings.hooks && Object.keys(settings.hooks).length === 0)
    delete settings.hooks;
}

function enable() {
  // Layer 1: Register PreToolUse hook (auto-approves before permission check)
  const settings = readJson(SETTINGS_PATH);
  upsertHook(settings, "PreToolUse", getHookCommand("hook-pre-tool"));
  // Layer 2: Register PermissionRequest hook (handles "Do you want to proceed?" prompts)
  upsertHook(
    settings,
    "PermissionRequest",
    getHookCommand("hook-permission")
  );
  writeJson(SETTINGS_PATH, settings);

  // Layer 3: Add broad allow rules to settings.local.json
  const local = readJson(LOCAL_SETTINGS_PATH);
  if (!local.permissions) local.permissions = {};
  if (!Array.isArray(local.permissions.allow)) local.permissions.allow = [];

  for (const rule of ALLOW_RULES) {
    if (!local.permissions.allow.includes(rule)) {
      local.permissions.allow.push(rule);
    }
  }
  writeJson(LOCAL_SETTINGS_PATH, local);

  console.log("Trust me bro, auto-approver enabled (3 layers):");
  console.log("  1. PreToolUse hook → auto-approve tool calls");
  console.log('  2. PermissionRequest hook → auto-approve "Do you want to proceed?"');
  console.log("  3. Broad allow rules in settings.local.json");
  console.log(`\nHooks registered in ${SETTINGS_PATH}`);
  console.log(`Allow rules written to ${LOCAL_SETTINGS_PATH}`);
  console.log("\nRestart Claude Code for changes to take effect.");
}

function disable() {
  // Remove hooks
  const settings = readJson(SETTINGS_PATH);
  removeHook(settings, "PreToolUse");
  removeHook(settings, "PermissionRequest");
  writeJson(SETTINGS_PATH, settings);

  // Remove our allow rules from settings.local.json
  const local = readJson(LOCAL_SETTINGS_PATH);
  if (local.permissions?.allow) {
    local.permissions.allow = local.permissions.allow.filter(
      (r) => !ALLOW_RULES.includes(r)
    );
    if (local.permissions.allow.length === 0) delete local.permissions.allow;
    if (
      local.permissions &&
      Object.keys(local.permissions).length === 0
    )
      delete local.permissions;
  }
  writeJson(LOCAL_SETTINGS_PATH, local);

  console.log(
    "Trust revoked. Claude Code will prompt for permissions again."
  );
}

function status() {
  const settings = readJson(SETTINGS_PATH);
  const preToolActive =
    settings.hooks?.PreToolUse?.some(isOurEntry) ?? false;
  const permReqActive =
    settings.hooks?.PermissionRequest?.some(isOurEntry) ?? false;

  const local = readJson(LOCAL_SETTINGS_PATH);
  const rulesActive = ALLOW_RULES.every((r) =>
    local.permissions?.allow?.includes(r)
  );

  console.log(`PreToolUse hook:        ${preToolActive ? "active" : "inactive"}`);
  console.log(`PermissionRequest hook: ${permReqActive ? "active" : "inactive"}`);
  console.log(`Allow rules:            ${rulesActive ? "active" : "inactive"}`);
  console.log(`Mode:                   ${readMode()}`);
  console.log(
    `\nOverall: ${preToolActive && permReqActive && rulesActive ? "TRUSTED (all layers active)" : "NOT FULLY TRUSTED"}`
  );
}

// --- Main ---

const command = process.argv[2];

switch (command) {
  case "hook-pre-tool": {
    // Drain stdin, then approve — unless it's a tool we leave to the human.
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const { tool_name } = readStdinJson(chunks);

    if (readMode() === "conservative" && NEVER_AUTO_APPROVE.has(tool_name)) {
      // Emit no decision so Claude Code shows the prompt and waits for you.
      process.stdout.write("{}\n");
      break;
    }

    process.stdout.write(PRE_TOOL_ALLOW + "\n");
    break;
  }

  case "hook-permission": {
    // Drain stdin then approve
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    process.stdout.write(PERMISSION_ALLOW + "\n");
    break;
  }

  case "enable": {
    enable();
    break;
  }

  case "disable": {
    disable();
    break;
  }

  case "status": {
    status();
    break;
  }

  case "mode": {
    const requested = process.argv[3];
    if (!requested) {
      console.log(`Current mode: ${readMode()}`);
      break;
    }
    if (!MODES.includes(requested)) {
      console.error(
        `Unknown mode "${requested}". Valid modes: ${MODES.join(", ")}`
      );
      process.exit(1);
    }
    setMode(requested);
    console.log(`Mode set to "${requested}".`);
    if (requested === "conservative") {
      console.log(
        "Multiple-choice questions will now be left for you to answer."
      );
    } else {
      console.log("Trust me bro — everything gets auto-approved.");
    }
    console.log("\nRestart Claude Code for changes to take effect.");
    break;
  }

  default: {
    console.log(`Usage: tmb <command>

Commands:
  enable          Trust me bro — auto-approve everything
  disable         Revoke trust — restore permission prompts
  status          Check if Claude trusts you, bro
  mode [name]     Show or set the approval mode

Modes:
  full            Auto-approve everything, including multiple-choice
                  questions (default)
  conservative    Auto-approve permission prompts, but let multiple-choice
                  questions through so you can answer them`);
    if (command) process.exit(1);
    break;
  }
}
