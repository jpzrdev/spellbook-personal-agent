from app.setup_vault import copy_template


def test_copy_does_not_overwrite(tmp_path):
    template = tmp_path / "template"
    (template / "raw").mkdir(parents=True)
    (template / "CLAUDE.md").write_text("template", encoding="utf-8")
    (template / "raw" / ".gitkeep").write_text("", encoding="utf-8")

    target = tmp_path / "vault"
    target.mkdir()
    (target / "CLAUDE.md").write_text("meu", encoding="utf-8")

    created, skipped = copy_template(template, target)

    assert (target / "CLAUDE.md").read_text(encoding="utf-8") == "meu"
    assert [str(p) for p in skipped] == ["CLAUDE.md"]
    assert (target / "raw" / ".gitkeep").exists()
    assert len(created) == 1
