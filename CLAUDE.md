# Gandalf

A personal system (agenda, studies, routines, knowledge).

## Architecture

- `bridge/`: Python 3.12 backend (FastAPI, uv). `app/main.py` has the routes; `app/gandalf/` does the 3-tier routing (rules → Haiku → headless Claude Code); `app/vault/` reads and writes the vault; `app/locales/` holds what depends on the assistant's language (Tier 1 rules and replies).
- `hud/`: React + Vite + TS + Tailwind v4 (tokens in `src/index.css`). Talks to the Bridge at `/api` (Vite proxy in dev; in production `app/server.py` serves the HUD and mounts the API at `/api`).
- `vault-template/`: the vault's initial structure; copied to `VAULT_PATH` (default `vault/`, ignored by git) without overwriting.
- A single config in `.env` at the root (see `.env.example`). Every route requires `Authorization: Bearer <BRIDGE_TOKEN>`.

## Language

- Code, identifiers, comments, the API, the HUD, docs and the vault's structure (folders, file names, frontmatter keys) are in **English**.
- The **assistant's language** (`GANDALF_LANGUAGE`: `en` | `pt-BR`) only changes what Gandalf says and the content of the notes it writes. Agent-facing text lives in `bridge/app/locales/` and in the prompts (which ask the model to reply in the user's language).

## Commands

- Start everything (development, HUD on :5173): `powershell -File scripts/start.ps1`
- Daily use / phone (the Bridge serves the built HUD on :8787): `powershell -File scripts/serve.ps1` (see `docs/PHONE.md`)
- Bridge tests: `cd bridge && uv run pytest`
- Check the HUD: `cd hud && npm run build && npm test`
- Create/update the vault: `cd bridge && uv run python -m app.setup_vault`
- Migrate a vault from the old Portuguese layout: `cd bridge && uv run python -m app.migrations.english_layout [--apply]`
- Download the voice models (once, ~1.9 GB): `cd bridge && uv run python -m app.speech.download_models`
- AI: the Claude Code CLI logged in with the subscription (`claude auth login`); no API key
