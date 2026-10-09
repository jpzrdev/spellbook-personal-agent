---
name: workouts
description: Keeps the Workouts module (spaces/workouts/) — logs a session the user did, adds or changes a workout plan, suggests the next session's loads from the log, answers about their training. Use whenever the user talks about their workouts, exercises, loads or the gym.
---

# Workouts

The Workouts page in the HUD shows the notes in `spaces/workouts/`. Read `spaces/workouts/_guide.md` (what the user sees) before answering questions about the page. If `spaces/workouts/` doesn't exist, the module is off: tell the user to turn on **Workouts** in **Modules** and stop.

## Data contract (the page depends on it)

One note per workout, `spaces/workouts/<slug>.md` (short lowercase-hyphen slug of the name):

```markdown
---
focus: upper            # upper | lower | full | cardio (exactly these values)
duration: 45            # minutes, a number
last_done: 2026-10-06   # YYYY-MM-DD, the last session logged
---
# Upper A

## Exercises
1. Bench press: 4 × 8
2. Rest (2 min)
3. Pull-ups: 4 × 6

## Log
| Date | Exercise | Sets | Reps | Load (kg) |
|---|---|---|---|---|
| 2026-10-06 | Bench press | 4 | 8 | 45 |

## Next session
- Bench press: 4 × 8 at 47.5 kg (why, in a few words).

## Notes
Free text.
```

- Keep the section headings and the log's columns **exactly** as above (in English: the page reads them); write the content (exercise names, notes) in the user's language.
- `Exercises`: a numbered list; a time in parentheses ("(2 min)") becomes a timer, so write rests as their own step.
- `Log`: one row per exercise per session, newest at the bottom; `Load (kg)` is a number (`42.5`, no unit; `0` for bodyweight). Use the exercise names of the `Exercises` list so the chart groups them.

## Logging a session (chat)

Find the workout (by name, or by the exercises mentioned; ask if it is ambiguous), append one row per exercise to `Log` (the date the user said, today by default), and set `last_done` to that date. Don't touch the other sections. Answer in one line with what was logged.

## A new workout or a change to a plan

Create or edit the note following the contract. Never invent loads in the log; a new workout starts with an empty `Log` table (header only).

## Suggest next loads (the "Suggest next loads" button, or when asked)

Read the `Log`. For each exercise in `Exercises`: if the last session hit the top of the rep range in every set, add 2.5 kg (upper body) or 5 kg (lower body); if reps dropped, keep the load; with no history, say "start light and log it". Write a short list in `## Next session` (replace what was there; one line per exercise with the reason). Don't write anywhere else.
