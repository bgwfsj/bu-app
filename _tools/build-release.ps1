$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$env:JAVA_HOME = Join-Path $env:USERPROFILE 'Android\jdk17\jdk-17.0.13+11'
$env:GRADLE_USER_HOME = Join-Path $env:USERPROFILE '.gradle'
$env:TMP = "$env:LOCALAPPDATA\Temp"
$env:TEMP = "$env:LOCALAPPDATA\Temp"
$gradle = Join-Path $env:USERPROFILE 'Android\gradle\gradle-8.5\bin\gradle.bat'
Push-Location $root
try {
    if ($args -contains '-clean') {
        & $gradle -p (Join-Path $root 'QuitSmokeApp') clean assembleRelease
    } else {
        & $gradle -p (Join-Path $root 'QuitSmokeApp') assembleRelease
    }
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
}
