# Pages the assistant composes (V3)

Status: **planned**. V1 ships ready-made modules the user turns on and off (see "Roadmap"); this document keeps what we
learned from a first prototype of free page generation, so V3 starts from it instead of from scratch.

## Goal

The user asks for a page in plain words ("a page for my workouts, with a log of loads") and the assistant **composes**
it: where the data lives, how the list and each item are shown, what the buttons do, how the assistant itself keeps it
up to date, and a guide that explains all of it. The result must be as precise as a module we built by hand.

## Roadmap

| Version | Who decides the page | What it needs |
|---|---|---|
| **V1** | We do: curated **modules** (Studies, Library, Workouts, Recipes, Reading) the user turns on/off | the block engine, typed actions, a guide + a skill per module |
| **V2** | The user customizes a module by hand: view, fields shown, block order, icon (the page settings) | validated settings, no AI |
| **V3** | The assistant composes new pages and changes existing ones | everything below |

## The prototype and the test

A first version (branch `feat/spaces`, October 2026) let the assistant write `spaces/<slug>/space.yaml` from a closed
catalog (4 views, 11 field types, 7 blocks, 30 icons), validated by the Bridge; a page that failed validation went back
to the same Claude Code session with the errors (up to 2 times), so the user never had to ask "redo it".

**Test:** "make a workouts page, research and add a first arm workout". The assistant made a valid page (a list with
a focus filter, exercises as steps with rest timers, a log table, a progression note) and a first workout. What went
wrong:

1. **A button that did nothing visible.** "Next session" sent a free prompt to Claude Code; the answer went to the
   session/receipt, not to the page. Nobody had decided *where the result of a button goes*.
2. **The assistant didn't know its own page.** Asked in the chat what the button did, Tier 2 answered it had no
   documentation about that page. The page existed only as a `space.yaml`; nothing described it in words, and the
   Tier 2 context didn't mention pages at all.
3. **The page was hard to find.** It was born a draft, reviewed only under a sub-menu; the reply didn't link to it.
4. **The research was blocked.** The request ran in a session that writes to the memory, which has no web access, so
   the "research" part was silently replaced by general knowledge.
5. **The data contract was the assistant's guess.** Logging a workout later through the chat depends on the assistant
   rediscovering the structure it invented; nothing guaranteed the next session would write in the same shape.

## What a composed page must contain (the "page package")

A page is not just a layout. In V3 the assistant writes the whole package, and the Bridge validates all of it:

| Part | File | Purpose |
|---|---|---|
| Layout | `spaces/<slug>/space.yaml` | fields, collection view, item blocks, actions (closed catalog) |
| **Guide** | `spaces/<slug>/_guide.md` | how the page works, in the user's language: what an item is, each field, each section, **each button and where its result goes**, how to add things by chat. Shown in the page ("How it works") and given to Tier 2 |
| **Skill** | `skills/<slug>/SKILL.md` | how Claude Code keeps the page: the data contract (frontmatter keys, section headings, table columns), how to log/add an item from the chat, the procedure behind each `skill` action |
| Items | `spaces/<slug>/*.md` | plain markdown notes |

Rules:

- **Every action is typed, with a declared destination** (V1 already enforces this):
  - `tasks`: open items of a list section become tasks (no AI);
  - `row`: a form that appends a row to a table section (no AI); optionally stamps a date field;
  - `skill`: runs a named skill on the item and **writes only into a declared section**; the page shows it running and
    refreshes when done.
  Free-prompt buttons are not allowed. Each action has a `description` (shown under the button and to the assistant).
- **The guide and the skill are generated with the layout and validated with it**: every field, section and action in
  `space.yaml` must be mentioned in the guide; every `skill` action must name a skill that exists and documents it.
- **The assistant knows its pages**: the Tier 2 context lists the active pages with their guides (trimmed), so "what
  does this button do?" is answered from the guide.
- **Composing is a two-step session when it needs the web**: a web-only research session first (as the Library does),
  then the composing session (writes only in `spaces/<slug>/` and `skills/<slug>/`) with the research as data.
- **Drafts are visible**: a dot on the menu, a link in the reply (`[Name](/p/<slug>)`), a preview with sample items
  before publishing.

## Pipeline

1. **Intent** (Tier 2): new page or change; does it need the web?
2. **Research** (optional, web-only session) → ephemeral result.
3. **Match a module/template** first; compose from scratch only when nothing fits.
4. **Compose** (Claude Code, `create-space` skill, writes only in `spaces/<slug>/` and `skills/<slug>/`): layout, guide,
   skill, and the items the user gave (never invented samples).
5. **Validate** (Bridge): schema; cross-references (guide covers every field/section/action; `skill` actions point at an
   existing skill; sections in the items match the layout). Errors go back to the same session (max 2 rounds).
6. **Smoke test** (Bridge, no AI): load the page, parse every block of every item (a checklist section has list items, a
   chart section has a table with the declared columns…). Failures go back like validation errors.
7. **Draft** → the user previews it (sample items rendered with the real blocks) → **Publish**.

## Catalog growth

The catalog stays closed. When a request needs something the catalog can't draw (a calendar view, a map, a per-series
chart…), the assistant uses the closest block and logs the gap (`spaces/_requests.md`). We add blocks in code, by
generic mechanism names (`steps`, not `recipe-steps`), so each new block serves many pages.

## What exists today (reusable)

- `bridge/app/spaces/`: schema (closed catalog, typed actions), store (items as markdown, sections, toggles, rows, tasks),
  templates; the validation-and-retry loop in `tier3._check_spaces`.
- `hud/src/components/spaces/`: the four views, the blocks (properties editable in place, checklist, steps with timers
  and focus mode, gallery, links, chart, markdown), the page settings.
- `docs/spaces-v3/create-space.SKILL.md`: the composing skill of the prototype (to be extended with the guide and the
  skill parts above).

## Open questions

- Can the assistant change a module we ship (V1), or only pages it made? (Proposal: it forks the module into a page.)
- Versioning a page package (undo a change the assistant made): git in the memory, or keep the previous `space.yaml`.
- Sharing pages between users (a "pack" marketplace): the package above is self-contained enough to be shared.
