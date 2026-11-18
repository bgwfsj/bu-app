$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    git add -A
    git commit -m 'v6.0.19: 更新检查增加网页备用通道'
    git tag v6.0.19
    git push origin main --tags
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
}
