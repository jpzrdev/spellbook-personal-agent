import re

from app.config import REPO_ROOT
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


def test_the_project_ships_the_skills_the_bridge_calls():
    """The Bridge calls these skills by name: they live in skills/ (versioned), not in the vault template."""
    skills = REPO_ROOT / "skills"
    called = {"schedule-event", "research", "save-research", "structure-material", "prepare-studies"}
    # native = what skills/.gitignore keeps in git (the user's own skills stay out)
    native = set(re.findall(r"^!/([^/]+)/$", (skills / ".gitignore").read_text(encoding="utf-8"), re.M))
    assert called <= native
    assert all((skills / n / "SKILL.md").is_file() for n in native)
    assert not (TEMPLATE / ".claude" / "skills").exists()
