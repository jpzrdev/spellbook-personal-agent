---
name: answer-from-memory
description: Answers a question using the memory's knowledge (wiki indexes and notes), citing the sources, and saves the answer in output/answers/. Use when the question depends on what the user has already written down ("what did I note about…", "based on my notes…").
---

# Answer from the memory

## Steps

1. Read `wiki/_master-index.md` and pick the relevant topics.
2. Read each topic's `_index.md` and then only the notes you need.
3. Only use text search (Grep) if the indexes are not enough. Also look in `raw/` if the subject hasn't been compiled yet.
4. Answer in the user's language, straight to the point, citing the notes used as `[[path/note]]` links. If the memory doesn't have the information, say so clearly and don't invent; you may complete it with general knowledge, marking what didn't come from the memory.
5. Save the answer in `output/answers/YYYY-MM-DD-<question-slug>.md`, with frontmatter `type: answer`, `created`, `question`, `sources` (list of links), followed by the answer.
6. **Compounding:** if the answer brings several notes together into something new and lasting (a comparison, a conclusion, a plan), also file it in the wiki as a `type: summary` note in the topic's folder (sources = the notes used), add it to the `_index.md` and append a line to `wiki/_log.md` (`answer`). A simple lookup doesn't need this.

## Final answer

The answer itself (short), followed by the path of the saved file.
