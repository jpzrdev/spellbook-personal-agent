# Gandalf

Sistema pessoal (agenda, estudos, rotinas, conhecimento).

## Arquitetura

- `bridge/`: backend Python 3.12 (FastAPI, uv). `app/main.py` tem as rotas; `app/gandalf/` faz o roteamento em 3 tiers (regras → Haiku → Claude Code headless); `app/vault/` lê e escreve o vault.
- `hud/`: React + Vite + TS + Tailwind v4 (tokens em `src/index.css`). Fala com o Bridge em `/api` (proxy do Vite no dev; em produção `app/servidor.py` serve o HUD e monta a API em `/api`).
- `vault-template/`: estrutura inicial do vault; copiada para `VAULT_PATH` (padrão `vault/`, ignorado pelo git) sem sobrescrever.
- Config única em `.env` na raiz (veja `.env.example`). Todas as rotas exigem `Authorization: Bearer <BRIDGE_TOKEN>`.

## Idioma

UI, notas do vault e comentários de alto nível em pt-BR. Identificadores de código em inglês.

## Comandos

- Subir tudo (desenvolvimento, HUD em :5173): `powershell -File scripts/start.ps1`
- Uso diário / celular (Bridge serve o HUD compilado em :8787): `powershell -File scripts/servir.ps1` (ver `docs/CELULAR.md`)
- Testes do Bridge: `cd bridge && uv run pytest`
- Checar o HUD: `cd hud && npm run build && npm test`
- Criar/atualizar vault: `cd bridge && uv run python -m app.setup_vault`
- Baixar modelos de voz (uma vez, ~1,9 GB): `cd bridge && uv run python -m app.speech.baixar_modelos`
- IA: Claude Code CLI logado com a assinatura (`claude auth login`); sem API key
