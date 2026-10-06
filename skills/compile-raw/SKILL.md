---
name: compile-raw
description: Reads the new files in raw/, extracts the knowledge into notes in wiki/, updates the indexes and marks each item as processed in raw/_processed.md (without deleting anything). Use for "organize my raw", "process my notes" or in the nightly routine.
---

# Compile raw/

Follow the vault's `CLAUDE.md` rules (who writes where, note format, indexes, language).

## Steps

1. Read `raw/_processed.md` (create it if it doesn't exist, with the title `# Processed items`). It lists the files in `raw/` already processed, one per line: `- [[raw/<file>]] → <notes created> (YYYY-MM-DD)`.
2. List the files in `raw/` (except `_processed.md` and `.gitkeep`) that are not in that list yet. If there are none, reply "Nothing new in raw/." and stop.
3. For each new file:
   - Read the content and decide the topic: studies (`wiki/studies/<subject>/`), personal (`wiki/personal/`) or about the user (`wiki/about-me/`).
   - Before creating a note, read `wiki/_master-index.md` and the topic's `_index.md` to see whether a note on the subject already exists. If it does, **add** to the existing note instead of duplicating.
   - Write short, atomic notes (one concept per note), in the user's language, with frontmatter `type`, `tags`, `created`, `sources` (link to the file in `raw/`).
   - Update the folder's `_index.md` (one link + 1 line per note). If you created a new subject or topic, create its `_index.md` and add the line to `wiki/_master-index.md`.
   - If the item is a task or an appointment (not knowledge), don't create a note: add the task to `life/tasks.md` in the Tasks plugin format.
4. Add each processed file to `raw/_processed.md`.
5. **Never delete or edit the files in `raw/`.**

## Final answer

A short summary: how many items were processed, notes created/updated (with path) and tasks added.
