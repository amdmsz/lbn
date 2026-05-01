param(
  [string]$Alias = "lbn-crm-release",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function New-ReleasePassword {
  $bytes = New-Object byte[] 36
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  [Convert]::ToBase64String($bytes)
}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$androidRoot = Join-Path $projectRoot "apps\mobile\android"
$releaseDir = Join-Path $androidRoot "release"
$keystoreRelativePath = "release/lbn-crm-release.jks"
$keystorePath = Join-Path $androidRoot $keystoreRelativePath
$propsPath = Join-Path $androidRoot "release-signing.properties"

if ((Test-Path $keystorePath) -and -not $Force) {
  throw "Keystore already exists: $keystorePath. Use -Force only if you intentionally want to replace the Android app signing identity."
}

if ((Test-Path $propsPath) -and -not $Force) {
  throw "Signing properties already exists: $propsPath. Use -Force only if you intentionally want to replace the Android app signing identity."
}

$keytool = (Get-Command keytool -ErrorAction Stop).Source
$storePassword = New-ReleasePassword
$keyPassword = $storePassword

New-Item -ItemType Directory -Force $releaseDir | Out-Null

if ($Force) {
  Remove-Item -Force $keystorePath, $propsPath -ErrorAction SilentlyContinue
}

& $keytool `
  -genkeypair `
  -v `
  -keystore $keystorePath `
  -alias $Alias `
  -keyalg RSA `
  -keysize 2048 `
  -validity 10000 `
  -storepass $storePassword `
  -keypass $keyPassword `
  -dname "CN=Lbn CRM, OU=Mobile, O=Lbn, L=China, ST=China, C=CN"

if ($LASTEXITCODE -ne 0) {
  throw "keytool failed with exit code $LASTEXITCODE"
}

$properties = @"
storeFile=$keystoreRelativePath
storePassword=$storePassword
keyAlias=$Alias
keyPassword=$keyPassword
"@

Set-Content -Path $propsPath -Value $properties -Encoding ascii -NoNewline

Write-Host "Created Android release keystore:"
Write-Host "  $keystorePath"
Write-Host "Created signing properties:"
Write-Host "  $propsPath"
Write-Host "Back up both files. Losing them prevents normal upgrades for installed APKs signed with this key."
