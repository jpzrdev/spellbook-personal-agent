---
tipo: rotina
nome: Commit diário do vault
cron: "50 23 * * *"
ativa: true
tier: 1
acao: git-commit
---
Salva no git tudo o que mudou no vault durante o dia, para poder desfazer qualquer alteração (inclusive da IA).
