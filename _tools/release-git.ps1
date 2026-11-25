$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$msgFile = Join-Path $root '_tools\release-message.txt'
$message = [IO.File]::ReadAllText($msgFile, [Text.Encoding]::UTF8).Trim()
Push-Location $root
try {
    git add -A
    git commit -m $message
    git tag v6.0.22
    git push origin main --tags
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
}
