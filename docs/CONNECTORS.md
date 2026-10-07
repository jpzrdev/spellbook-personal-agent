# Connectors (MCP): Google Calendar and Gmail

Gandalf uses the connectors through **Tier 3's Claude Code**, running inside the memory. The Bridge never talks to Google directly.

## Step 0: log in to Claude Code (required)

```
claude auth login
```

Sign in with your Claude subscription account. Without it, tiers 2 and 3 don't work.

## Option A (recommended): your Claude account's connectors

1. At claude.ai → **Settings → Connectors**, turn on **Google Calendar** and **Gmail** and authorize your Google account (you sign in to Google yourself, nobody else).
2. Run `claude mcp list` in a terminal. If the connectors show up there, Claude Code can already use them.
3. Tell Claude (in the project chat): it sees the exact server names, fills in the `allowed-tools` of the `sync-calendar` and `email-summary` skills and tests them.

> To confirm on first use: whether claude.ai connectors are available in the automatic mode (`claude -p`) the Bridge uses.

## Option B: your own MCP server

If option A doesn't work, you can add a Google MCP server just for the memory:

```
cd memory
claude mcp add --scope project <name> -- <server command>
```

This creates `memory/.mcp.json`, which the Bridge passes explicitly to Claude Code (`--mcp-config`). Google servers usually require creating OAuth credentials in the Google Cloud Console; the steps depend on the server you choose.

## How permissions work

Tier 3 runs with restricted tools (`--allowedTools`). Each skill allows only what it needs in its own `SKILL.md`:

```yaml
---
name: sync-calendar
allowed-tools: mcp__<calendar-server>
---
```

- `email-summary` runs with **ephemeral output**: read-only, without writing to the memory; the result shows up in "Today's summaries" for 48 h.
- `sync-calendar` writes to `life/agenda/` (regular output in the memory).
