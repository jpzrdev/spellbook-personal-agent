---
name: plan-week
description: Crosses the agenda, the tasks and the studies and proposes study and work blocks for the week, saving them in output/plans/. Use on Sunday evening or when asked to "plan my week".
---

# Plan the week

## Steps

1. Period: Monday to Sunday of next week (if today is Sunday) or of the current week.
2. Read `life/agenda/` for each day of the period (days without a file = no known appointments).
3. Read `life/tasks.md`: open tasks due in the period or overdue, and the high-priority ones.
4. Read `wiki/studies/_index.md` and the subjects' `_index.md` to know what is being studied; consider exams and deadlines that show up in the agenda or tasks.
5. Read `wiki/about-me/` to respect preferences (hours, routine, goals).
6. Build the plan:
   - Fit 50–90 min blocks in the free slots, never over appointments.
   - Prioritize what has the nearest deadline; spread the subjects the user is studying across the week.
   - Leave slack: at most ~60% of the free time taken.
7. Save it in `output/plans/week-YYYY-Www.md` (ISO week), with frontmatter `type: plan`, `created`, and one section per day with the blocks (`- 19:00–20:00 Calculus II: problem set 3`), written in the user's language.
8. **Don't change** `life/tasks.md` or the agenda: it's a proposal.

## Final answer

A 3–5 line summary with the main focuses of the week and the file path.
