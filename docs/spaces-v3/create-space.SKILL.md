---
name: create-space
description: Makes or changes a page in the HUD (recipes, books, workouts, projects, people, pull requests, anything the user wants to keep and browse). Writes spaces/<slug>/space.yaml from a closed catalog of views, field types and blocks; the HUD draws it. Use when the user asks for a new tab/page/section to organize something, or to change how a page looks.
output: spaces
---

# Make or change a page

A page is a folder `spaces/<slug>/` in the memory: a `space.yaml` that says how to show it, and one markdown note per item. You **compose** the page from the catalog below; you never write UI code. The Bridge validates `space.yaml`: anything outside the catalog is rejected and comes back to you with the errors. You can only write inside `spaces/`.

## How to decide

1. **Start from the closest template** and adapt it (rename, drop or add fields, change blocks). Templates: `recipes` (cards, ingredients checklist, steps with timers), `reading` (kanban by status, cover, progress, rating), `workouts` (list, exercises as steps with rest timers, chart of loads), `projects` (kanban by stage, next-steps checklist, links), `people` (table, last contact, birthday), `pull-requests` (table fed by the GitHub MCP, refresh action). Set `template: <id>` when you start from one.
2. **Keep it small**: 3 to 7 fields, 2 to 5 blocks. Only what the user asked for or obviously needs. Each extra field is something the user has to fill.
3. **New page → `draft: true`.** The user reviews it in Pages and publishes it. When changing a page, keep `draft` as it is.
4. **Labels, names, options' labels and section names in the user's language.** Keys (`key`, option `value`) stay short lowercase English-like identifiers (`time_min`, `status`, `want`).
5. If the user asks for something the catalog can't draw (a map, a drawing board, a calendar view…), use the closest block (`markdown` always works) and say in one line what is missing. Never invent a block, a view or a field type.

## space.yaml

```yaml
name: Recipes                 # menu name (≤ 40)
icon: chef-hat                # from the icon list below
color: gold                   # primary | primary-light | wood | gold | ember | violet | silver
description: One line about the page.
item_name: recipe             # singular, for "New recipe"
draft: true
template: recipes             # optional
fields:                       # the item's properties (frontmatter of each note); `title` is built in, don't declare it
  - {key: time_min, label: Time, type: duration}
  - key: kind
    label: Kind
    type: select
    options:                  # select only; value + label + color
      - {value: sweet, label: Sweet, color: gold}
      - {value: savory, label: Savory, color: wood}
  - {key: rating, label: Rating, type: rating}
  - {key: photo, label: Photo, type: image}
collection:                   # how the list is shown
  view: cards                 # cards | list | table | kanban
  show: [time_min, rating]    # fields on each card / row (table columns)
  image: photo                # cards only: an image field as the cover
  group_by: kind              # REQUIRED for kanban: a select field (its options are the columns)
  filters: [kind]             # select, tags or bool fields
  sort: {field: rating, order: desc}
item:                         # how one item is shown, top to bottom
  - {block: properties, fields: [time_min, kind, rating]}   # fields optional (empty = all)
  - {block: checklist, section: Ingredients, persist: false}
  - {block: steps, section: Steps, timers: true}
  - {block: markdown, section: Notes}
actions:                      # optional buttons (≤ 6); they send `prompt` to you with the page/item as context
  - {label: Shopping list, prompt: "Add the missing ingredients of this recipe to my tasks.", scope: item}
```

### Field types

`text` · `number` (optional `unit: kg`) · `select` (needs `options`) · `tags` · `date` (YYYY-MM-DD) · `bool` · `rating` (0–5, or `max`) · `url` · `image` (an https URL or a memory path) · `duration` (minutes) · `progress` (needs `max`, e.g. 100 for %).

### Blocks (each one reads a `## Section` of the item's note)

| block | reads | shows |
|---|---|---|
| `properties` | the frontmatter | the fields, editable in place |
| `markdown` | any text | the text (tables, quotes, lists…) |
| `checklist` | a list (`- [ ] x` or `- x`) | items to check; `persist: false` keeps the checks only on screen |
| `steps` | a numbered list | a timeline; "(10 min)" in a step becomes a timer; focus mode one step at a time |
| `gallery` | images (`![alt](url)` or `![[path]]`) | an image grid |
| `links` | markdown links | link cards |
| `chart` | a markdown table | a line or bar chart: `x:` and `y:` are column names, `kind: line | bar` |

Every block may have `title:` (default: the section's name). Section names must match the note's `## headings` exactly (case doesn't matter).

### Icons

sparkles, chef-hat, book-open, dumbbell, folder-kanban, users, git-pull-request, plane, film, music, heart, wallet, leaf, star, map, camera, code, home, gamepad, briefcase, list-checks, notebook, pill, shopping-cart, lightbulb, trophy, baby, dog, car, palette.

## Items

Each item is `spaces/<slug>/<item-slug>.md`:

```markdown
---
time_min: 50
kind: sweet
rating: 4
---
# Carrot cake

## Ingredients
- 3 carrots
- 3 eggs

## Steps
1. Preheat the oven. (10 min)
2. Bake. (40 min)

## Notes
Less sugar next time.
```

When making a page, add the items the user gave you (or that already exist in the memory about the subject: copy the content, don't move the original notes). Don't make up sample items. Frontmatter values must fit the field types; select values must be one of the options.

## Final answer

One or two lines: the page's name as a link to it (`[Name](/p/<slug>)`, the HUD opens it), the view, what each item shows, and (for a new page) that it is a draft: the user opens the link to review it and taps **Publish** to put it on the menu.
