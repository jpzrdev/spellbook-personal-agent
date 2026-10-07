---
name: lint-wiki
description: Health check of the wiki. Fixes broken links, orphan notes, missing index entries and missing frontmatter, and finds contradictions, stale claims, duplicated notes and gaps worth a new note or a web search. Writes a report in output/lint/. Use for "check my wiki", "clean up my notes", "lint" or in the weekly routine.
context: memory-health
---

# Wiki health check (lint)

Follow the memory's `CLAUDE.md` rules (who writes where, note format, indexes, log, language).

The request ends with `<memory_health>`: a mechanical check the Bridge has just run (broken links, orphans, notes missing from their folder's `_index.md`, wiki notes without frontmatter `type`, items in `raw/` not compiled yet). Start from it instead of scanning everything again.

## 1. Mechanical fixes (do them)

- **Broken link** in `wiki/`: if the intended note exists under another path or name, fix the link; if it doesn't exist and the subject deserves a note, list it as a gap (don't invent the content). Never edit `raw/`, `receipts/`, `_annotations/` or `_sources/`.
- **Orphan note**: add it to its folder's `_index.md` (one link + 1 line) and link it from the most related note.
- **Missing from the index**: add the line to the folder's `_index.md`.
- **No frontmatter**: add `type`, `tags`, `created` (from the file if you can tell, otherwise today) and `sources` if known.

## 2. Judgment (read, then decide)

Read `wiki/_master-index.md`, the `_index.md` files and the notes changed recently (`wiki/_log.md` says which). Look for:

- **Contradictions** between notes (two different values, dates or conclusions). Fix it when one side is clearly older or wrong (cite the source); otherwise report it for the user.
- **Stale claims**: facts that depend on time (prices, versions, rules, "currently…") older than ~6 months. Report them; don't search the web.
- **Duplicates**: two notes on the same concept. Merge into one, keep the other as a short note pointing to it (so links don't break), and update the indexes.
- **Missing connections**: notes that should link to each other and don't. Add the links.
- **Gaps**: concepts mentioned in several notes without a note of their own, or questions the wiki can't answer yet. Suggest them (new note, something to research on the web, a source to add to `raw/`).

Don't rewrite notes that are fine. Small, safe changes; anything big or doubtful goes to the report.

## 3. Report and log

- Write `output/lint/YYYY-MM-DD.md` with frontmatter `type: report`, `created`; sections **Fixed**, **To review** (contradictions, stale claims) and **Suggestions** (gaps, questions to explore), with `[[links]]`.
- Append one line to `wiki/_log.md`: `- YYYY-MM-DD HH:MM · lint · <n> fixes, <n> to review — [[output/lint/YYYY-MM-DD]]`.
- If there are items in `raw/` not compiled yet, just mention how many (compile-raw handles them).

## Final answer

Short: how many fixes, what needs the user's attention (at most 3 items) and the report's path.
