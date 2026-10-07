"""The vault → memory rename (folder, .env key, untouched template files and routines)."""

import shutil
from pathlib import Path

from app import config
from app.migrations import memory_rename

TEMPLATE = Path(__file__).resolve().parents[2] / "memory-template"


def _old_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    vault = repo / "vault"
    (vault / "life" / "routines").mkdir(parents=True)
    (repo / ".env").write_text("# Vault path (relative)\nVAULT_PATH=vault\nBRIDGE_TOKEN=x\n", encoding="utf-8")
    (vault / "CLAUDE.md").write_text("my own rules about the vault\n", encoding="utf-8")
    (vault / "life" / "routines" / "ask.md").write_text("---\nskill: answer-from-vault\n---\nAsk.\n", encoding="utf-8")
    return repo


def test_dry_run_changes_nothing(tmp_path, monkeypatch, capsys):
    repo = _old_repo(tmp_path)
    monkeypatch.setattr(memory_rename, "REPO_ROOT", repo)
    memory_rename.main([])
    assert (repo / "vault").is_dir() and not (repo / "memory").exists()
    out = capsys.readouterr().out
    assert "vault/ → memory/" in out and "VAULT_PATH → MEMORY_PATH" in out and "CLAUDE.md was edited by hand" in out


def test_apply_moves_folder_env_and_routines(tmp_path, monkeypatch):
    repo = _old_repo(tmp_path)
    monkeypatch.setattr(memory_rename, "REPO_ROOT", repo)
    monkeypatch.setattr(memory_rename, "TEMPLATE", TEMPLATE)
    memory_rename.main(["--apply"])
    memory = repo / "memory"
    assert memory.is_dir() and not (repo / "vault").exists()
    env = (repo / ".env").read_text(encoding="utf-8")
    assert "MEMORY_PATH=memory" in env and "VAULT_PATH" not in env and "# Memory path" in env
    assert "skill: answer-from-memory" in (memory / "life" / "routines" / "ask.md").read_text(encoding="utf-8")
    assert (memory / "CLAUDE.md").read_text(encoding="utf-8") == "my own rules about the vault\n"  # edited: kept


def test_untouched_template_copy_is_replaced(tmp_path, monkeypatch):
    repo = _old_repo(tmp_path)
    claude_md = repo / "vault" / "CLAUDE.md"
    monkeypatch.setattr(memory_rename, "OLD_TEMPLATE", {"CLAUDE.md": memory_rename.digest(claude_md)})
    monkeypatch.setattr(memory_rename, "REPO_ROOT", repo)
    monkeypatch.setattr(memory_rename, "TEMPLATE", TEMPLATE)
    memory_rename.main(["--apply"])
    assert (repo / "memory" / "CLAUDE.md").read_text(encoding="utf-8") == (TEMPLATE / "CLAUDE.md").read_text(encoding="utf-8")


def test_settings_still_find_an_old_vault(tmp_path, monkeypatch):
    repo = tmp_path / "repo"
    (repo / "vault").mkdir(parents=True)
    monkeypatch.setattr(config, "REPO_ROOT", repo)
    monkeypatch.delenv("MEMORY_PATH", raising=False)
    monkeypatch.delenv("VAULT_PATH", raising=False)
    assert config._memory_path() == repo / "vault"
    (repo / "memory").mkdir()
    assert config._memory_path() == repo / "memory"
    shutil.rmtree(repo / "memory")
    monkeypatch.setenv("VAULT_PATH", "/data/notes")
    assert config._memory_path() == Path("/data/notes")
