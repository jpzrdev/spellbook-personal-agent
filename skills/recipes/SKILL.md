---
name: recipes
description: Keeps the Recipes module (spaces/recipes/) — saves a recipe the user pastes, links or dictates, updates one they cooked (rating, tried, notes), adapts quantities to other servings, answers about their recipes. Use whenever the user talks about recipes, cooking or a dish they want to keep.
---

# Recipes

The Recipes page in the HUD shows the notes in `spaces/recipes/`. Read `spaces/recipes/_guide.md` (what the user sees) before answering questions about the page. If `spaces/recipes/` doesn't exist, the module is off: tell the user to turn on **Recipes** in **Modules** and stop.

## Data contract (the page depends on it)

One note per recipe, `spaces/recipes/<slug>.md`:

```markdown
---
time_min: 50          # total minutes, a number
servings: 8           # a number
kind: sweet           # savory | sweet | drink (exactly these values)
tags: [oven, quick]   # short lowercase words
rating: 4             # 1–5, only when the user rated it
tried: true           # only when the user cooked it
photo: https://…      # optional: an image URL or a memory path
---
# Carrot cake

One or two lines about it (optional).

## Ingredients
- 3 medium carrots
- 3 eggs

## Steps
1. Preheat the oven to 180 °C. (10 min)
2. Blend the carrots, eggs and oil.

## Notes
Free text.
```

- Keep the section headings exactly as above (in English: the page reads them); write the content in the user's language.
- `Ingredients`: one ingredient per line (`- quantity + ingredient`), no sub-lists.
- `Steps`: a numbered list; put waiting/cooking times in parentheses ("(40 min)") so they become timers.

## Saving a recipe

From pasted text or a page the user gave: keep their quantities and method, split into the contract; fill `time_min`, `servings` and `kind` when the source says so (never guess `rating` or `tried`). Answer with the link `[Name](/p/recipes/<slug>)`.

## Adapt servings (the "Adapt servings" button, or when asked)

Rewrite the ingredient list for the number of servings asked (double by default), rounding to kitchen-friendly amounts, in `## Adapted` (replace what was there; start with one line "For N servings:"). Don't change `Ingredients` or anything else.
