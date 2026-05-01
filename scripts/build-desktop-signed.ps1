$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($env:WIN_CSC_LINK)) {
  throw "WIN_CSC_LINK is required. Set it to a trusted Windows code-signing .pfx path."
}

if ([string]::IsNullOrWhiteSpace($env:WIN_CSC_KEY_PASSWORD)) {
  throw "WIN_CSC_KEY_PASSWORD is required for the Windows code-signing certificate."
}

if ($env:WIN_CSC_LINK -match '^https?://') {
  throw "This signed release script expects WIN_CSC_LINK to be a local .pfx path so signtool.exe can sign the final artifacts."
}

if (-not (Test-Path -LiteralPath $env:WIN_CSC_LINK)) {
  throw "WIN_CSC_LINK does not exist: $env:WIN_CSC_LINK"
}

function Resolve-SignTool {
  if (-not [string]::IsNullOrWhiteSpace($env:SIGNTOOL_PATH)) {
    if (-not (Test-Path -LiteralPath $env:SIGNTOOL_PATH)) {
      throw "SIGNTOOL_PATH does not exist: $env:SIGNTOOL_PATH"
    }

    return $env:SIGNTOOL_PATH
  }

  $candidate = Get-ChildItem -LiteralPath "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "\\x64\\signtool\.exe$" } |
    Sort-Object FullName -Descending |
    Select-Object -First 1

  if ($null -eq $candidate) {
    throw "signtool.exe was not found. Install Windows SDK or set SIGNTOOL_PATH."
  }

  return $candidate.FullName
}

function Invoke-CodeSign {
  param(
    [string] $SignTool,
    [string] $Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Cannot sign missing file: $Path"
  }

  & $SignTool sign /fd SHA256 /f $env:WIN_CSC_LINK /p $env:WIN_CSC_KEY_PASSWORD /tr http://timestamp.digicert.com /td SHA256 /v $Path

  if ($LASTEXITCODE -ne 0) {
    throw "signtool.exe failed for $Path"
  }

  $signature = Get-AuthenticodeSignature -LiteralPath $Path

  if ($signature.Status -ne "Valid") {
    throw "Authenticode signature verification failed for ${Path}: $($signature.Status) $($signature.StatusMessage)"
  }
}

$signTool = Resolve-SignTool

npm run desktop:icon
npm run desktop:dist

$desktopPackage = Get-Content (Join-Path $PSScriptRoot "..\apps\desktop\package.json") -Raw | ConvertFrom-Json
$version = $desktopPackage.version
$distPath = Join-Path $PSScriptRoot "..\apps\desktop\dist"
$winUnpackedExe = Join-Path $distPath "win-unpacked\Lbn CRM.exe"
$installer = Join-Path $distPath "Lbn-CRM-$version-x64.exe"
$zipPath = Join-Path $distPath "Lbn-CRM-$version-x64.zip"

Invoke-CodeSign -SignTool $signTool -Path $winUnpackedExe
Invoke-CodeSign -SignTool $signTool -Path $installer

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $distPath "win-unpacked\*") -DestinationPath $zipPath -Force

Write-Host "Signed desktop installer verified: $installer"
Write-Host "Signed portable zip rebuilt: $zipPath"
