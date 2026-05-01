$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$androidRoot = Join-Path $projectRoot "apps\mobile\android"
$propsPath = Join-Path $androidRoot "release-signing.properties"
$outputApk = Join-Path $androidRoot "app\build\outputs\apk\release\app-release.apk"
$downloadApk = Join-Path $projectRoot "public\downloads\Lbn-CRM-Android.apk"

if (-not (Test-Path $propsPath)) {
  throw "Missing $propsPath. Run `npm run mobile:release-keystore` first."
}

Push-Location $projectRoot
try {
  npm run mobile:sync
} finally {
  Pop-Location
}

Push-Location $androidRoot
try {
  .\gradlew.bat assembleRelease
} finally {
  Pop-Location
}

if (-not (Test-Path $outputApk)) {
  throw "Signed release APK was not produced: $outputApk"
}

New-Item -ItemType Directory -Force (Split-Path $downloadApk) | Out-Null
Copy-Item -Force $outputApk $downloadApk

Write-Host "Signed Android APK:"
Write-Host "  $outputApk"
Write-Host "CRM download copy:"
Write-Host "  $downloadApk"
