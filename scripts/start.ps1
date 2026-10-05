# Starts the Bridge and the HUD together (Windows). Ctrl+C stops both.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path "$root\.env")) {
    Copy-Item "$root\.env.example" "$root\.env"
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $token = [Convert]::ToBase64String($bytes) -replace '[+/=]', ''
    (Get-Content "$root\.env") -replace '^BRIDGE_TOKEN=$', "BRIDGE_TOKEN=$token" | Set-Content -Encoding utf8 "$root\.env"
    Write-Host '.env created from .env.example (token generated).'
}

Push-Location "$root\bridge"
uv run python -m app.setup_vault
Pop-Location

if (-not (Test-Path "$root\hud\node_modules")) {
    Push-Location "$root\hud"; npm install; Pop-Location
}

$bridge = Start-Process uv -ArgumentList 'run', 'python', '-m', 'app.main' -WorkingDirectory "$root\bridge" -NoNewWindow -PassThru
try {
    Push-Location "$root\hud"
    npm run dev
}
finally {
    Pop-Location
    if (-not $bridge.HasExited) { taskkill /PID $bridge.Id /T /F | Out-Null }
}
