# claude-trust-me-bro

> "Can I run this command?" — "Trust me bro."

A CLI tool that automatically approves **all** [Claude Code](https://docs.anthropic.com/en/docs/claude-code) permission prompts. One command to skip every confirmation dialog and let Claude Code run fully autonomous.

Tired of clicking "yes" on every file read, shell command, and tool call? Just `tmb enable` and get back to work.

## The Problem

Claude Code is amazing, but it asks for permission **constantly**:

- "Can I read this file?" Yes.
- "Can I run this shell command?" Yes.
- "Can I write to this file?" Yes.
- "Do you want to proceed?" **YES.**

When you're doing trusted work — supervised coding sessions, batch refactors, CI/CD pipelines, or long autonomous tasks — these prompts kill your flow.

## The Solution

```bash
npx claude-trust-me-bro enable
```

That's it. No more prompts. Claude Code just... does its thing.

## How It Works

The tool uses a **three-layer approach** to make sure no permission prompt slips through:

| Layer | Mechanism | What It Does |
|-------|-----------|--------------|
| 1 | `PreToolUse` hook | Auto-approves tool calls before the permission check fires |
| 2 | `PermissionRequest` hook | Auto-approves "Do you want to proceed?" dialogs |
| 3 | Allow rules in `settings.local.json` | Broad wildcard permissions for all built-in and MCP tools |

All three layers are installed and removed together — no partial states, no leftovers.

## Modes

How aggressive the auto-approval is depends on the mode:

| Mode | Behavior |
|------|----------|
| `full` (default) | Trust me bro — auto-approves **everything**, including multiple-choice questions |
| `conservative` | Auto-approves plain permission prompts, but leaves multiple-choice questions (Claude Code's `AskUserQuestion` tool) for you to answer |

Multiple-choice questions aren't yes/no permission prompts — they ask you to pick between real options, so in `conservative` mode they're left alone instead of silently bypassed.

```bash
# Show the current mode
tmb mode

# Let multiple-choice questions through; auto-approve the rest
tmb mode conservative

# Back to auto-approving absolutely everything
tmb mode full
```

The mode is stored in `~/.claude/tmb.json` and applies to whatever you have enabled. Restart Claude Code after changing it.

## Installation

```bash
# Install globally
npm install -g claude-trust-me-bro

# Or just use npx (no install needed)
npx claude-trust-me-bro enable
```

## Usage

The CLI command is `tmb` — short, sweet, and to the point.

```bash
# Enable auto-approve — trust me bro
tmb enable

# Check if Claude trusts you
tmb status

# Revoke trust — bring back permission prompts
tmb disable
```

After enabling or disabling, **restart Claude Code** for changes to take effect.

## What Gets Auto-Approved

Every built-in Claude Code tool and all MCP server tools:

| Tool | Description |
|------|-------------|
| `Bash(*)` | Shell commands |
| `Read(*)` | File reading |
| `Write(*)` | File creation |
| `Edit(*)` | File editing |
| `Glob(*)` | File pattern matching |
| `Grep(*)` | Content search |
| `WebFetch(*)` | HTTP requests |
| `WebSearch(*)` | Web searches |
| `NotebookEdit(*)` | Jupyter notebook edits |
| `mcp__*` | All MCP server tools |

## Where Changes Are Made

| File | What's Added |
|------|-------------|
| `~/.claude/settings.json` | `PreToolUse` and `PermissionRequest` hooks |
| `~/.claude/settings.local.json` | Wildcard allow rules for tool permissions |
| `~/.claude/tmb.json` | The current approval mode (`full` or `conservative`) |

Running `tmb disable` cleanly removes everything this tool added, without touching your other Claude Code settings.

## Frequently Asked Questions

### Is this safe?

This tool is designed for **supervised, trusted environments**. It removes the safety net of permission prompts, so only use it when you're actively watching what Claude Code does, or in controlled environments like CI pipelines.

### Does it work with MCP servers?

Yes. The `mcp__*` wildcard rule covers all MCP server tools automatically, no matter how many servers you have configured.

### Can I undo it?

Absolutely. Run `tmb disable` and restart Claude Code. Everything goes back to normal — permission prompts return and all hooks are removed.

### Does it survive Claude Code updates?

The hooks and rules are stored in your user-level Claude Code settings, which persist across updates.

## Requirements

- Node.js >= 18
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed

## Related

- [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code) — Official docs for Claude Code
- [Claude Code Hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) — How hooks work in Claude Code

## License

MIT
