---
name: daily-summary
description: Writes today's journal in life/journal/YYYY-MM-DD.md with the agenda and the 3 priorities. Use in the morning routine or when asked to "plan my day" / "daily summary".
---

# Daily summary

Reference date: today, in the user's time zone.

## Steps

1. Read today's `life/agenda/YYYY-MM-DD.md` (it may not exist: a day without appointments).
2. Read `life/tasks.md` (tasks format: `📅` date, `⏫🔼🔽` priority). Choose **3 priorities**: first the overdue ones and today's, then the high-priority ones.
3. If `life/journal/YYYY-MM-DD.md` already exists, **update only the day plan section** and keep the rest (the user may have written in it).
4. Otherwise, create the file (headings and text in the user's language):

```markdown
---
type: journal
date: YYYY-MM-DD
---
# <weekday>, <long date>

## Day plan
### Agenda
- 09:00–10:30 ...
### 3 priorities
- [ ] ...

## Notes
```

## Final answer

Two or three lines: today's appointments and the 3 priorities.
