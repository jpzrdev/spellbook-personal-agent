# "Daily use" / phone mode: builds the HUD and starts only the Bridge, which serves everything at http://127.0.0.1:8787
# (API at /api). For access from the phone, see docs/PHONE.md (Tailscale).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path "$root\.env")) {
    Write-Host 'Run scripts/start.ps1 first (it creates the .env and the memory).'
    exit 1
}
if (-not (Test-Path "$root\hud\node_modules")) {
    Push-Location "$root\hud"; npm install; Pop-Location
}

Push-Location "$root\hud"
npm run build
Pop-Location

Push-Location "$root\bridge"
uv run python -m app.setup_memory
uv run python -m app.main --production
Pop-Location
