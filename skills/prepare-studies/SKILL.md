---
name: prepare-studies
description: Builds the study collection for a new subject (certification, exam, course, topic) in wiki/studies/<subject>/ — an index with the goal and syllabus + a few long, in-depth topic notes — and also completes a subject with a new topic or deepens an existing topic. Researches the official content on the web when there is any. Use for "I want to study …", "put together material on …", "help me prepare for …", "deepen the topic …".
# Web only to research the official content/syllabus; the rest is writing in the memory (Write/Edit already allowed in Tier 3).
allowed-tools: WebSearch, WebFetch
---

# Prepare studies

The subject is the user's **personal study collection**, not a course: it has no progress, "done", schedule or scheduled reviews. They read the topics whenever they want, ask questions in the Studies tab chat and test themselves with quizzes the tab generates from the notes' text. That's why **the content of the notes is what matters**: it has to be complete and deep enough to study from alone and to yield good questions. Write the notes in the user's language.

## Before writing

1. **Understand the goal** from the request: what to study, what for (certification, exam, work, curiosity) and at what level. Read `wiki/about-me/` (level, preferences).
2. **Does it already exist?** Check `wiki/studies/_index.md`. If the subject exists, **complete** what is missing instead of duplicating.
3. **Research** with WebSearch/WebFetch: official guide, syllabus, domains and weights, documentation, free official material. Prefer the primary source (whoever issues the certification, official documentation). Note the links used.
   - **Don't invent.** If you can't find an official source (or the certification doesn't exist under that name), say so clearly, show the closest thing you found and build the material from the sources that do exist, marking what is an assumption.

## What to create

Folder `wiki/studies/<subject>/` (short slug, lowercase, with hyphens; e.g. `claude-certified-architect`).

1. **`_index.md`** (frontmatter `type: index`, `tags: [studies/<subject>]`, `created`, `sources` with the links):
   - `# <Title>` on the first line of the body (the Studies tab uses this title);
   - **Goal** (1–3 sentences) and, for an exam/certification, the **format** (questions, time, passing score);
   - **Content map**: the topics, each with a link to its note and 1 line saying what it covers (and its weight in the exam, if any);
   - **Official material** (links).
   - No schedule, no tasks.
2. **A few long topic notes.** Prefer **4 to 8 topics** that group related subjects (a 12-item syllabus becomes ~6 topics) over many shallow notes. Each note (`<topic>.md`, frontmatter `type: concept`, `tags`, `created`, `sources`, `order: <n>` = suggested reading position) has, as a reference, **1,500 to 3,000 words**, with `##` sections:
   - **Overview**: what it is, what it's for, where it fits in the subject (2–3 paragraphs);
   - **Concepts** explained in prose, one `###` per concept: definition, how it works inside, **why** it is that way, when to use it and when not to;
   - Concrete, worked **examples** (code, calculations, sentences, real cases, depending on the subject), step by step;
   - **Comparisons** between similar concepts (a table when it helps);
   - **Pitfalls and common confusions** (what usually shows up, if the source says so);
   - **Connections** with other topics of the subject (`[[wiki/studies/<subject>/<other>]]`);
   - **Going deeper**: official links for that topic.
   - Clear language, no padding; depth comes from explaining the why and from examples, not from repetition.
   - **Don't** write question/flashcard sections or progress fields (`state`, `review`, `interval`, `reviews`): the quizzes are generated on the spot by the Studies tab.
3. **Indexes:** add the subject to `wiki/studies/_index.md` (link + 1 line; remove the "no subjects yet" line) and, if it's the first subject, check that `wiki/_master-index.md` points to Studies.

## Completing a subject (request "Complete the existing subject with a new topic: …")

Create only the new note(s) in the same format, with `order` after the existing ones, and update the map in `_index.md`. If the subject already fits an existing topic, add to it (as in "Deepen") instead of creating a new note.

## Deepening a topic (request "Deepen the existing topic `<note>`")

1. Read the note, the subject's `_index.md`, the user's annotations on the topic (`_annotations/` with `topic:` = the note; read-only) and the material in `_sources/` about that subject. Research the web if needed.
2. Rewrite/expand the note to the format above (1,500–3,000 words), **keeping** what is already right, the `#` title, `order`, `created`, `tags` and the sources (add the new ones), and the "From your material: …" sections (integrate their content into the text or keep them).
3. Old format: remove the questions (flashcards) section and the frontmatter fields `state`, `review`, `interval`, `reviews`, `studied_on`, `last_review`.
4. If the request has a focus ("more examples of X"), prioritize it.

## Rules

- Don't copy long passages from the sources; explain in your own words and cite the link.
- Dates as `YYYY-MM-DD`, in the user's time zone.

## Final answer

Short: what was created or deepened (subject, topics and approximate size of each), what couldn't be confirmed in the sources, and the next step ("open the Studies tab and start with <topic>; use Quiz to test yourself").
