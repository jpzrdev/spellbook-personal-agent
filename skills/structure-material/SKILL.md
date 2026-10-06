---
name: structure-material
description: Takes the material the user uploaded for a study subject (PDFs, texts, Markdown, converted Word, images in wiki/studies/<subject>/_sources/) and structures it into topics — creates new topic notes or adds to existing ones when the subject already has a note. Use when the request lists files in _sources/ to structure.
---

# Structure study material

The request carries the subject (`wiki/studies/<subject>/`) and the list of files uploaded now to `_sources/`. A `.docx` always has a `.md` next to it with the extracted text: read the `.md`.

## Before writing

1. Read `wiki/studies/<subject>/_index.md` (goal, syllabus) and the title/summary of **every** topic note in the folder (ignore `_annotations/` and `_sources/` as destinations; you may read `_annotations/` to understand what the user already knows).
2. Read the uploaded material (PDF and images: use the Read tool normally; large files, in parts).
3. For each subject in the material, decide:
   - **already has a topic** on that subject → add to it;
   - **new subject** within the scope of the course → a new topic note;
   - **out of scope** → don't create anything; just mention it in the answer.
   If the request says the material is for a specific topic, prefer adding to it.

## How to add to an existing topic

- Don't delete what is there and don't touch `order`, `created` and `tags`.
- Integrate what the material brings that is new (concepts, examples, missing details) into the right sections of the note, explaining in clear language (the user's language); if it fits no section, add a section "From your material: <short source name>". Be generous: the topic is the user's study collection and the Studies tab quizzes come from its text.
- Don't write questions/flashcards or progress fields (`state`, `review`, `interval`, `reviews`).
- Add the source file to `sources:` in the frontmatter (`"[[wiki/studies/<subject>/_sources/<file>]]"`).

## How to create a new topic

Same format as the notes of the `prepare-studies` skill (frontmatter `type: concept`, `tags: [studies/<subject>]`, `created`, `sources`, `order: <after the last one>`; `# Title`; overview, explained concepts, examples, pitfalls, connections). Prefer adding to an existing topic over creating a small note. Update the map in `_index.md` with the new topic's link.

## Rules

- Only what the material supports; don't invent. Summarize in your own words; don't copy long passages.
- Never delete or edit files in `_sources/` or `_annotations/`.
- Unreadable or empty material: say so and don't create anything from it.

## Final answer

A short list: topics updated (what went into each), new topics created, and what was left out (and why).
