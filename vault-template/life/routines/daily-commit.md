---
type: routine
name: Daily vault commit
cron: "50 23 * * *"
active: true
tier: 1
action: git-commit
---
Commits to git everything that changed in the vault during the day, so any change (including the AI's) can be undone.
