---
name: email-summary
description: Reads the emails received since yesterday through the Gmail connector and summarizes only the important ones (deadlines, bills, people close to the user, pending replies). Read-only; made to run with ephemeral output (writes nothing in the vault).
# Read-only on Gmail (claude.ai account connector). Sending, replying, forwarding and deleting are blocked.
# Always ephemeral: whether run by a routine, from the Skills tab or on request, the summary stays only in the HUD (48 h).
output: ephemeral
title: Email summary
allowed-tools: mcp__claude_ai_Gmail__search_threads, mcp__claude_ai_Gmail__get_thread, mcp__claude_ai_Gmail__get_message, mcp__claude_ai_Gmail__list_labels
---

# Summary of the important emails

Uses the claude.ai account's Gmail connector. If the Gmail tools are not available, reply "Gmail connector not configured." and stop.

## Rules

- **Read-only.** Don't send, reply, archive, mark as read or delete anything.
- **Don't write files.** The result is shown in the HUD and expires; nothing goes to the vault.
- Don't copy whole email bodies, document numbers, passwords, codes or payment links.

## Steps

1. List the emails received in the inbox since yesterday at 00:00 (the user's time zone), ignoring promotions, social networks and newsletters.
2. Consider important: deadlines and bills, messages from people (not automated) that ask for a reply, appointment changes, notices from school/work.
3. Read the user's preferences in `wiki/about-me/`, if any, to calibrate what is important.

## Final answer (in the user's language)

If there is nothing important: "No important emails since yesterday."

Otherwise, at most 7 items, from most to least urgent:

```markdown
- **Sender**: subject in a few words. What to do (and by when, if there is a deadline).
```
