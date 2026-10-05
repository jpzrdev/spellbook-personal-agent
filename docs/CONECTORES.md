# Conectores (MCP): Google Calendar e Gmail

O Gandalf usa os conectores através do **Claude Code do Tier 3**, rodando dentro do vault. O Bridge não fala com o Google diretamente.

## Passo 0: login no Claude Code (obrigatório)

```
claude auth login
```

Entre com a conta da assinatura Claude Pro. Sem isso, os tiers 2 e 3 não funcionam.

## Opção A (recomendada): conectores da sua conta Claude

1. Em claude.ai → **Configurações → Conectores**, ative **Google Calendar** e **Gmail** e autorize sua conta Google (você faz o login no Google, ninguém mais).
2. Rode `claude mcp list` num terminal. Se os conectores aparecerem lá, o Claude Code já pode usá-los.
3. Avise o Claude (no chat do projeto): ele vê o nome exato dos servidores, preenche o `allowed-tools` das skills `sincronizar-agenda` e `resumo-emails` e testa.

> A confirmar no primeiro uso: se os conectores do claude.ai ficam disponíveis no modo automático (`claude -p`) usado pelo Bridge.

## Opção B: servidor MCP próprio

Se a opção A não servir, dá para adicionar um servidor MCP do Google só para o vault:

```
cd vault
claude mcp add --scope project <nome> -- <comando do servidor>
```

Isso cria `vault/.mcp.json`, que o Bridge passa explicitamente ao Claude Code (`--mcp-config`). Servidores do Google costumam exigir criar credenciais OAuth no Google Cloud Console; o passo a passo depende do servidor escolhido.

## Como as permissões funcionam

O Tier 3 roda com ferramentas restritas (`--allowedTools`). Cada skill libera só o que precisa no próprio `SKILL.md`:

```yaml
---
name: sincronizar-agenda
allowed-tools: mcp__<servidor-do-calendar>
---
```

- `resumo-emails` roda com **saída efêmera**: só leitura, sem escrever no vault; o resultado aparece em "Resumos de hoje" por 48 h.
- `sincronizar-agenda` escreve em `vida/agenda/` (saída normal no vault).
