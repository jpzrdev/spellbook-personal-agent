"""What a page (`spaces/<slug>/space.yaml`) may declare: a closed catalog the HUD knows how to draw.

Gandalf composes pages from these pieces; it never writes UI code. Anything outside the catalog fails
validation with a message precise enough for the model to fix in one go.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

Color = Literal["primary", "primary-light", "wood", "gold", "ember", "violet", "silver"]
# The icons the HUD maps to lucide (hud/src/components/spaces/icons.ts): keep both lists in sync.
ICONS = (
    "sparkles", "chef-hat", "book-open", "dumbbell", "folder-kanban", "users", "git-pull-request", "plane",
    "film", "music", "heart", "wallet", "leaf", "star", "map", "camera", "code", "home", "gamepad", "briefcase",
    "list-checks", "notebook", "pill", "shopping-cart", "lightbulb", "trophy", "baby", "dog", "car", "palette",
)
Icon = Literal[ICONS]  # type: ignore[valid-type]
FieldType = Literal["text", "number", "select", "tags", "date", "bool", "rating", "url", "image", "duration", "progress"]
KEY = r"^[a-z][a-z0-9_]{0,39}$"
Section = Annotated[str, Field(min_length=1, max_length=60)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Option(Strict):
    value: str = Field(min_length=1, max_length=40)
    label: str | None = Field(default=None, max_length=40)
    color: Color = "silver"


class FieldDef(Strict):
    key: str = Field(pattern=KEY)
    label: str = Field(min_length=1, max_length=40)
    type: FieldType = "text"
    options: list[Option] = Field(default_factory=list, max_length=12)  # select
    max: float | None = Field(default=None, gt=0)  # rating (default 5) and progress (required)
    unit: str | None = Field(default=None, max_length=12)  # number ("kg", "R$")

    @model_validator(mode="after")
    def _check(self):
        if self.type == "select" and not self.options:
            raise ValueError(f"field `{self.key}`: a select needs `options`")
        if self.type != "select" and self.options:
            raise ValueError(f"field `{self.key}`: only a select has `options`")
        if self.type == "progress" and not self.max:
            raise ValueError(f"field `{self.key}`: progress needs `max`")
        return self


class Sort(Strict):
    field: str
    order: Literal["asc", "desc"] = "asc"


class Collection(Strict):
    """How the list of items is drawn."""

    view: Literal["cards", "list", "table", "kanban"] = "cards"
    show: list[str] = Field(default_factory=list, max_length=8)  # fields on the card / row / table columns
    group_by: str | None = None  # kanban: a select field (its options are the columns)
    image: str | None = None  # cards: an image field shown as the cover
    sort: Sort | None = None
    filters: list[str] = Field(default_factory=list, max_length=4)  # select, tags or bool fields


class _Block(Strict):
    title: str | None = Field(default=None, max_length=60)  # heading over the block (default: the section's name)


class PropertiesBlock(_Block):
    block: Literal["properties"]
    fields: list[str] = Field(default_factory=list)  # empty: all of them


class MarkdownBlock(_Block):
    block: Literal["markdown"]
    section: Section


class ChecklistBlock(_Block):
    block: Literal["checklist"]
    section: Section
    persist: bool = True  # false: the checks live only on the screen (e.g. ingredients while cooking)


class StepsBlock(_Block):
    block: Literal["steps"]
    section: Section
    timers: bool = True  # "(10 min)" in a step becomes a timer


class GalleryBlock(_Block):
    block: Literal["gallery"]
    section: Section


class LinksBlock(_Block):
    block: Literal["links"]
    section: Section


class ChartBlock(_Block):
    block: Literal["chart"]
    section: Section  # a markdown table in the section
    x: str = Field(min_length=1, max_length=40)  # column for the horizontal axis
    y: str = Field(min_length=1, max_length=40)  # numeric column
    kind: Literal["line", "bar"] = "line"
    series: str | None = Field(default=None, max_length=40)  # a column that splits the rows in series (one shown at a time)


Block = Annotated[
    PropertiesBlock | MarkdownBlock | ChecklistBlock | StepsBlock | GalleryBlock | LinksBlock | ChartBlock,
    Field(discriminator="block"),
]
SECTION_BLOCKS = ("markdown", "checklist", "steps", "gallery", "links", "chart")


class Action(Strict):
    """A button with a declared result (never a free prompt: the user must see where its result goes).

    - `tasks`: the open items of a list `section` become tasks tagged `tag` (no AI);
    - `row`: a form appends a row to the table in `section` (`columns` when the table doesn't exist yet), and `touch`
      sets a date field to the row's date (no AI);
    - `skill`: Claude Code runs `skill` with `task` on the item and writes only into `section`.
    """

    label: str = Field(min_length=1, max_length=30)
    description: str = Field(min_length=1, max_length=200)  # what it does and where the result goes (shown and given to Gandalf)
    kind: Literal["tasks", "row", "skill"]
    scope: Literal["page", "item"] = "item"
    section: Section | None = None
    tag: str | None = Field(default=None, pattern=r"^[\w/-]{1,40}$")
    columns: list[str] = Field(default_factory=list, max_length=8)
    touch: str | None = None
    skill: str | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9-]{0,59}$")
    task: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _check(self):
        if self.kind in ("tasks", "row") and (self.scope != "item" or not self.section):
            raise ValueError(f"action `{self.label}`: {self.kind} works on an item and needs `section`")
        if self.kind == "row" and not self.columns:
            raise ValueError(f"action `{self.label}`: row needs `columns`")
        if self.kind == "skill" and not (self.skill and self.task):
            raise ValueError(f"action `{self.label}`: skill needs `skill` and `task`")
        if self.kind == "skill" and self.scope == "item" and not self.section:
            raise ValueError(f"action `{self.label}`: a skill on an item needs the `section` it writes")
        return self


class Space(Strict):
    name: str = Field(min_length=1, max_length=40)
    icon: Icon = "sparkles"  # type: ignore[valid-type]
    color: Color = "primary"
    description: str = Field(default="", max_length=200)
    item_name: str = Field(default="item", min_length=1, max_length=30)  # singular, for "New <item>"
    draft: bool = False  # a draft is reviewed in Pages before it shows up on the menu
    template: str | None = Field(default=None, max_length=40)
    fields: list[FieldDef] = Field(default_factory=list, max_length=20)
    collection: Collection = Field(default_factory=Collection)
    item: list[Block] = Field(min_length=1, max_length=12)
    actions: list[Action] = Field(default_factory=list, max_length=6)

    def field(self, key: str) -> FieldDef | None:
        return next((f for f in self.fields if f.key == key), None)

    def sections(self) -> list[str]:
        """The item body's sections, in the order of the blocks (a new item gets one heading per section)."""
        seen: list[str] = []
        for b in self.item:
            name = getattr(b, "section", None)
            if name and name.lower() not in [s.lower() for s in seen]:
                seen.append(name)
        return seen

    @model_validator(mode="after")
    def _references(self):
        keys = [f.key for f in self.fields]
        if len(set(keys)) != len(keys):
            raise ValueError("field keys must be unique")
        if "title" in keys:
            raise ValueError("`title` is built in (the item's name): don't declare it as a field")
        types = {f.key: f.type for f in self.fields}

        def need(key: str, where: str, allowed: tuple[str, ...] | None = None) -> None:
            if key == "title" and allowed is None:
                return
            if key not in types:
                raise ValueError(f"{where}: unknown field `{key}` (declared: {', '.join(keys) or 'none'})")
            if allowed and types[key] not in allowed:
                raise ValueError(f"{where}: `{key}` is {types[key]}, it must be {' or '.join(allowed)}")

        c = self.collection
        for k in c.show:
            need(k, "collection.show")
        for k in c.filters:
            need(k, "collection.filters", ("select", "tags", "bool"))
        if c.sort:
            need(c.sort.field, "collection.sort")
        if c.image:
            need(c.image, "collection.image", ("image",))
        if c.view == "kanban":
            if not c.group_by:
                raise ValueError("collection: a kanban needs `group_by` (a select field)")
            need(c.group_by, "collection.group_by", ("select",))
        elif c.group_by:
            need(c.group_by, "collection.group_by", ("select",))
        for i, b in enumerate(self.item):
            if isinstance(b, PropertiesBlock):
                for k in b.fields:
                    need(k, f"item[{i}] properties")
        for a in self.actions:
            if a.touch:
                need(a.touch, f"action `{a.label}`.touch", ("date",))
        return self


def errors(e: ValidationError) -> list[str]:
    """Pydantic's errors as short lines (`item.2.section: Field required`)."""
    out = []
    for err in e.errors():
        loc = ".".join(str(p) for p in err["loc"] if not str(p).endswith("Block"))
        msg = str(err["msg"]).removeprefix("Value error, ")
        out.append(f"{loc}: {msg}" if loc else msg)
    return out
