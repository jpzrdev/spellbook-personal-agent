# Gandalf

Sistema pessoal para agenda, estudos, rotinas e conhecimento: um HUD web, um backend (Bridge) com o roteador Gandalf e um vault do Obsidian como memória.

> Projeto pessoal em desenvolvimento. Interface e notas em português do Brasil.

## Como funciona

- **HUD** (`hud/`): React + Vite + TypeScript + Tailwind v4, instalável como app (PWA) no celular.
- **Bridge** (`bridge/`): FastAPI em Python 3.12. Roteia cada pedido em 3 níveis:
  1. **Regras** (sem IA): tarefas, lembretes, agenda do dia, respondidos direto do vault.
  2. **Haiku** via Claude Code: triagem e respostas rápidas.
  3. **Claude Code headless**: tarefas longas (pesquisas, resumos, estudos) com skills e ferramentas restritas.
- **Vault** (`vault-template/`): notas em Markdown (Obsidian) que servem de memória: wiki, tarefas, rotinas, diário e recibos de cada pedido.
- **Rotinas** agendadas por cron (definidas em notas do vault), notificações push, voz offline (Whisper + Kokoro) e conectores do Google Agenda e Gmail.

## Requisitos

- [uv](https://docs.astral.sh/uv/) (instala o Python 3.12 automaticamente)
- Node.js 20+
- Obsidian (para abrir o vault)
- Claude Code CLI: `npm install -g @anthropic-ai/claude-code` e depois `claude auth login` (usa a assinatura Claude, sem API key)

> Se o app do Claude veio da Microsoft Store, instale essas ferramentas **no seu próprio terminal**: o que é instalado de dentro do app fica numa pasta virtual que o resto do Windows não enxerga.

## Começar

```powershell
powershell -File scripts/start.ps1
```

Na primeira execução o script cria o `.env` (com um token aleatório), cria o vault em `vault/` e instala as dependências do HUD. Depois abra:

- HUD: http://localhost:5173
- Bridge: http://127.0.0.1:8787/docs

Voz (opcional, offline): baixe os modelos uma vez com `cd bridge && uv run python -m app.speech.baixar_modelos` (~1,9 GB em `bridge/dados/modelos/`). Depois, segure o botão redondo do HUD para falar com o Gandalf.

Uso diário (e acesso pelo celular): `powershell -File scripts/servir.ps1` compila o HUD e o Bridge serve tudo em http://127.0.0.1:8787. Para o celular, veja [docs/CELULAR.md](docs/CELULAR.md) (Tailscale, HTTPS, instalar como app). Conectores do Google: [docs/CONECTORES.md](docs/CONECTORES.md).

Para usar o vault no Obsidian: *Open folder as vault* → `vault/`.

## Testes

```bash
cd bridge && uv run pytest
cd hud && npm run build && npm test
```
