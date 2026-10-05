# Sobe o Bridge e o HUD juntos (Windows). Ctrl+C encerra os dois.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path "$root\.env")) {
    Copy-Item "$root\.env.example" "$root\.env"
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $token = [Convert]::ToBase64String($bytes) -replace '[+/=]', ''
    (Get-Content "$root\.env") -replace '^BRIDGE_TOKEN=$', "BRIDGE_TOKEN=$token" | Set-Content -Encoding utf8 "$root\.env"
    Write-Host '.env criado a partir do .env.example (token gerado).'
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
