# Creates bluedart-fulfillment-deploy.zip for Hostinger upload
# Run from repo: powershell -File services/bluedart-fulfillment/scripts/create-hostinger-zip.ps1

$src = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$zip = Join-Path $src "bluedart-fulfillment-deploy.zip"

if (Test-Path $zip) { Remove-Item $zip -Force }

$temp = Join-Path $env:TEMP "bluedart-fulfillment-deploy"
if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
New-Item -ItemType Directory -Path (Join-Path $temp "bluedart-fulfillment") | Out-Null
$dest = Join-Path $temp "bluedart-fulfillment"

$include = @(
  "server.js",
  "package.json",
  "public",
  "src",
  "render.yaml",
  "README.md"
)

foreach ($item in $include) {
  $from = Join-Path $src $item
  if (Test-Path $from) {
    Copy-Item $from -Destination $dest -Recurse -Force
  }
}

Compress-Archive -Path (Join-Path $temp "bluedart-fulfillment") -DestinationPath $zip -Force
Remove-Item $temp -Recurse -Force

Write-Host "Created: $zip"
Write-Host ""
Write-Host "Hostinger settings:"
Write-Host "  Root directory: bluedart-fulfillment"
Write-Host "  Entry file:     server.js"
Write-Host "  Build command:  None"
Write-Host "  PORT env:       3000"
