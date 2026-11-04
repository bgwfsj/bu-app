$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    node _tools\build.mjs
    node _tools\check.js
    node _tools\test.mjs
}
finally {
    Pop-Location
}
