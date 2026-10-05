# Gandalf

A personal system for your agenda, studies, routines and knowledge: a web HUD, a backend (the Bridge) with the Gandalf router, and an Obsidian vault as memory.

> A personal project in development. The code and the interface are in English; the assistant talks to you and writes your notes in the language you choose (`GANDALF_LANGUAGE`: `en` or `pt-BR`).

## How it works

- **HUD** (`hud/`): React + Vite + TypeScript + Tailwind v4, installable as an app (PWA) on the phone.
- **Bridge** (`bridge/`): FastAPI on Python 3.12. Routes each request through 3 tiers:
  1. **Rules** (no AI): tasks, reminders, the day's agenda, answered straight from the vault (in English and Portuguese).
  2. **Haiku** through Claude Code: triage and quick answers.
  3. **Headless Claude Code**: long tasks (research, summaries, studies) with skills and restricted tools.
- **Vault** (`vault-template/`): Markdown notes (Obsidian) that act as memory: wiki, tasks, routines, journal and a receipt for every request.
- **Routines** scheduled by cron (defined in vault notes), push notifications, offline voice (Whisper + Kokoro) and Google Calendar and Gmail connectors.

## Requirements

- [uv](https://docs.astral.sh/uv/) (installs Python 3.12 automatically)
- Node.js 20+
- Obsidian (to open the vault)
- Claude Code CLI: `npm install -g @anthropic-ai/claude-code` and then `claude auth login` (uses your Claude subscription, no API key)

> If the Claude app came from the Microsoft Store, install these tools **from your own terminal**: whatever is installed from inside the app lives in a virtual folder the rest of Windows can't see.

## Getting started

```powershell
powershell -File scripts/start.ps1
```

On the first run the script creates the `.env` (with a random token), creates the vault in `vault/` and installs the HUD's dependencies. Set `GANDALF_LANGUAGE` in the `.env` to the language you want Gandalf to speak. Then open:

- HUD: http://localhost:5173
- Bridge: http://127.0.0.1:8787/docs

Voice (optional, offline): download the models once with `cd bridge && uv run python -m app.speech.download_models` (~1.9 GB in `bridge/data/models/`). Then hold the HUD's round button to talk to Gandalf.

Daily use (and access from the phone): `powershell -File scripts/serve.ps1` builds the HUD and the Bridge serves everything at http://127.0.0.1:8787. For the phone, see [docs/PHONE.md](docs/PHONE.md) (Tailscale, HTTPS, installing as an app). Google connectors: [docs/CONNECTORS.md](docs/CONNECTORS.md).

To use the vault in Obsidian: *Open folder as vault* → `vault/`.

### Upgrading a vault from the Portuguese layout

Older versions used Portuguese folder and field names (`vida/tarefas.md`, `recibos/`…). To move an existing vault (and `bridge/dados/`, `.env`) to the current layout:

```bash
cd bridge && uv run python -m app.migrations.english_layout          # dry run: shows what would change
cd bridge && uv run python -m app.migrations.english_layout --apply  # applies it
```

Commit the vault's git before applying, so it can be undone.

## Tests

```bash
cd bridge && uv run pytest
cd hud && npm run build && npm test
```
