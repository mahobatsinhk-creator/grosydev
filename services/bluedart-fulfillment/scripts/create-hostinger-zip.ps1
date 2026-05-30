# Creates bluedart-fulfillment-deploy.zip for Hostinger upload
# Hostinger requires package.json at the ROOT of the zip (not inside a subfolder).
# Run: powershell -File services/bluedart-fulfillment/scripts/create-hostinger-zip.ps1

$src = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$zip = Join-Path $src "bluedart-fulfillment-deploy.zip"

if (Test-Path $zip) { Remove-Item $zip -Force }

$temp = Join-Path $env:TEMP "bluedart-fulfillment-deploy-root"
if (Test-Path $temp) { Remove-Item $temp -Recurse -Force }
New-Item -ItemType Directory -Path $temp | Out-Null

$include = @(
  "server.js",
  "package.json",
  "public",
  "src"
)

foreach ($item in $include) {
  $from = Join-Path $src $item
  if (Test-Path $from) {
    Copy-Item $from -Destination $temp -Recurse -Force
  }
}

# Zip the folder contents so package.json is at archive root
Compress-Archive -Path (Join-Path $temp "*") -DestinationPath $zip -Force
Remove-Item $temp -Recurse -Force

Write-Host "Created: $zip"
Write-Host ""
Write-Host "ZIP layout (root level):"
Write-Host "  package.json"
Write-Host "  server.js"
Write-Host "  src/"
Write-Host "  public/"
Write-Host ""
Write-Host "Hostinger settings:"
Write-Host "  Framework:      Other"
Write-Host "  Root directory: (leave empty)"
Write-Host "  Entry file:     server.js"
Write-Host "  Build command:  (leave empty / None)"
Write-Host "  Output dir:     (leave empty)"
Write-Host "  Node.js:        22.x"
Write-Host "  PORT env:       3000"
