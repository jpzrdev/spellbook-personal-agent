from app.migrations.english_layout import Plan
from app.migrations.memory_skills import migrate_skills


def _skill(folder, body: str) -> None:
    folder.mkdir(parents=True)
    (folder / "SKILL.md").write_text(f"---\nname: {folder.name}\ndescription: d\n---\n{body}\n", encoding="utf-8")


def test_skills_leave_the_memory(tmp_path):
    memory, skills = tmp_path / "memory", tmp_path / "project-skills"
    old = memory / ".claude" / "skills"
    _skill(skills / "daily-summary", "Native.")
    _skill(skills / "plan-week", "Native.")
    _skill(old / "daily-summary", "Native.")  # untouched copy
    _skill(old / "plan-week", "Edited by the user.")  # conflict
    _skill(old / "review-studies", "Mine.")  # the user's own
    (old / ".gitkeep").write_text("", encoding="utf-8")

    dry = Plan(apply=False)
    migrate_skills(memory, skills, dry)
    assert (old / "daily-summary").is_dir() and not (skills / "review-studies").exists()

    plan = Plan(apply=True)
    migrate_skills(memory, skills, plan)
    assert plan.steps == dry.steps and len(plan.steps) == 2
    assert plan.warnings == [".claude/skills/plan-week differs from skills/plan-week; left in the memory (merge them by hand)"]
    assert not (old / "daily-summary").exists()
    assert "Mine." in (skills / "review-studies" / "SKILL.md").read_text(encoding="utf-8")
    assert "Native." in (skills / "plan-week" / "SKILL.md").read_text(encoding="utf-8")
    assert "Edited" in (old / "plan-week" / "SKILL.md").read_text(encoding="utf-8")


def test_the_empty_skills_folder_is_removed(tmp_path):
    memory, skills = tmp_path / "memory", tmp_path / "project-skills"
    _skill(memory / ".claude" / "skills" / "mine", "Mine.")
    migrate_skills(memory, skills, Plan(apply=True))
    assert (skills / "mine" / "SKILL.md").is_file() and not (memory / ".claude" / "skills").exists()
