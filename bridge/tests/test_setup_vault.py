from app.setup_vault import TEMPLATE, copy_template


def test_copy_does_not_overwrite(tmp_path):
    template = tmp_path / "template"
    (template / "raw").mkdir(parents=True)
    (template / "CLAUDE.md").write_text("template", encoding="utf-8")
    (template / "raw" / ".gitkeep").write_text("", encoding="utf-8")

    target = tmp_path / "vault"
    target.mkdir()
    (target / "CLAUDE.md").write_text("mine", encoding="utf-8")

    created, skipped = copy_template(template, target)

    assert (target / "CLAUDE.md").read_text(encoding="utf-8") == "mine"
    assert [str(p) for p in skipped] == ["CLAUDE.md"]
    assert (target / "raw" / ".gitkeep").exists()
    assert len(created) == 1


def test_template_has_the_skills_the_bridge_calls():
    """The Bridge calls these skills by name; the template has to ship them."""
    skills = {p.parent.name for p in (TEMPLATE / ".claude" / "skills").glob("*/SKILL.md")}
    assert {"schedule-event", "research", "save-research", "structure-material", "prepare-studies"} <= skills
