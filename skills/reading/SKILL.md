---
name: reading
description: Keeps the Reading module (spaces/reading/) — adds a book to the list, updates status, progress or rating, saves highlights and notes, summarizes them, answers about what the user is reading. Use whenever the user talks about books they want to read, are reading or finished.
---

# Reading

The Reading page in the HUD shows the notes in `spaces/reading/`. Read `spaces/reading/_guide.md` (what the user sees) before answering questions about the page. If `spaces/reading/` doesn't exist, the module is off: tell the user to turn on **Reading** in **Modules** and stop.

## Data contract (the page depends on it)

One note per book, `spaces/reading/<slug>.md`:

```markdown
---
author: Cal Newport
status: reading       # want | reading | done (exactly these values)
progress: 40          # percent, 0–100
rating: 4             # 1–5, only when the user rated it
finished: 2026-10-01  # YYYY-MM-DD, only when done
genres: [productivity]
cover: https://…      # optional: an image URL or a memory path
---
# Deep Work

## Summary
Five lines (written by the "Summarize my notes" button).

## Highlights
> A quote the user saved.

## Notes
The user's thoughts.
```

- Keep the section headings exactly as above (in English: the page reads them); write the content in the user's language.
- When the user finishes a book: `status: done`, `progress: 100`, `finished:` the date.
- Quotes go to `Highlights` as blockquotes, newest last, with the page number when the user gives it.

## Summarize my notes (the button, or when asked)

Read `Highlights` and `Notes` and write five short lines in `## Summary` (replace what was there): the main ideas the user marked, in their words when possible. Don't add ideas that aren't in their notes. Don't write anywhere else.
