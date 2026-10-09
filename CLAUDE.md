# Gandalf

A personal system (agenda, studies, routines, knowledge).

## Architecture

- `bridge/`: Python 3.12 backend (FastAPI, uv). `app/main.py` has the routes; `app/persona.py` keeps the assistant's identity from the first-run setup (`/setup` in the HUD: name, wizard/witch and colors in `<memory>/agent.json`; the user's name and intro in `wiki/about-me/profile.md`), filled into the prompts via `{{name}}`/`{{kind}}`; `app/gandalf/` does the 3-tier routing (rules → Haiku → headless Claude Code); `app/memory/` reads, edits, searches and health-checks the memory (the HUD's Memory tab replaces any external notes app); `app/locales/` holds what depends on the assistant's language (Tier 1 rules and replies).
- `hud/`: React + Vite + TS + Tailwind v4 (tokens in `src/index.css`). Talks to the Bridge at `/api` (Vite proxy in dev; in production `app/server.py` serves the HUD and mounts the API at `/api`).
- `skills/`: Gandalf's skills (`<name>/SKILL.md`), part of the project, not the memory. The native ones are versioned (listed in `skills/.gitignore`; add a new native skill there); the ones the user or Gandalf create stay out of git. Tier 3 loads a copy as a Claude Code plugin (`bridge/data/plugin/`), so Claude Code picks skills by itself (`/gandalf:<name>` for an explicit run); sessions that write to the memory may also create and edit `skills/` (Claude Code doesn't allow editing loaded skills, hence the copy).
- `memory-template/`: the memory's initial structure; copied to `MEMORY_PATH` (default `memory/`, ignored by git) without overwriting.
- A single config in `.env` at the root (see `.env.example`). Every route requires `Authorization: Bearer <BRIDGE_TOKEN>`.

## Language

- Code, identifiers, comments, the API, the HUD, docs and the memory's structure (folders, file names, frontmatter keys) are in **English**.
- The **assistant's language** (`GANDALF_LANGUAGE`: `en` | `pt-BR`) only changes what Gandalf says and the content of the notes it writes. Agent-facing text lives in `bridge/app/locales/` and in the prompts (which ask the model to reply in the user's language).

## Commands

- Start everything (development, HUD on :5173): `powershell -File scripts/start.ps1`
- Daily use / phone (the Bridge serves the built HUD on :8787): `powershell -File scripts/serve.ps1` (see `docs/PHONE.md`)
- Bridge tests: `cd bridge && uv run pytest`
- Check the HUD: `cd hud && npm run build && npm test`
- Create/update the memory: `cd bridge && uv run python -m app.setup_memory`
- Move skills out of an older memory (`memory/.claude/skills/` → `skills/`): `cd bridge && uv run python -m app.migrations.memory_skills [--apply]`
- Rename an old `vault/` (and `VAULT_PATH`) to `memory/`: `cd bridge && uv run python -m app.migrations.memory_rename [--apply]`
- Migrate a memory from the old Portuguese layout: `cd bridge && uv run python -m app.migrations.english_layout [--apply]`
- Rebuild the chats from before conversations existed, from the receipts: `cd bridge && uv run python -m app.migrations.conversations_from_receipts [--apply]`
- Download the voice models (once, ~1.9 GB): `cd bridge && uv run python -m app.speech.download_models`
- AI: the Claude Code CLI logged in with the subscription (`claude auth login`); no API key
