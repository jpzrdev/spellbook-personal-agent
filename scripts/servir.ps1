# Modo "uso diário" / celular: compila o HUD e sobe só o Bridge, que serve tudo em http://127.0.0.1:8787
# (API em /api). Para acessar do celular, veja docs/CELULAR.md (Tailscale).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path "$root\.env")) {
    Write-Host 'Rode primeiro scripts/start.ps1 (cria o .env e o vault).'
    exit 1
}
if (-not (Test-Path "$root\hud\node_modules")) {
    Push-Location "$root\hud"; npm install; Pop-Location
}

Push-Location "$root\hud"
npm run build
Pop-Location

Push-Location "$root\bridge"
uv run python -m app.setup_vault
uv run python -m app.main --producao
Pop-Location
