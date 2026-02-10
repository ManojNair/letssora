#Requires -Version 7.0
<#
.SYNOPSIS
    Deploys the LetsSora application to Azure App Service (Linux) using zip deployment.

.DESCRIPTION
    This script:
    1. Builds the React client locally (required for Vite)
    2. Packages source code (without node_modules)
    3. Deploys to Azure - Oryx builds and installs dependencies on the server

.PARAMETER ResourceGroupName
    The name of the Azure resource group containing the App Service.

.PARAMETER WebAppName
    The name of the Azure App Service to deploy to.

.PARAMETER SkipClientBuild
    Skip the client build step (use existing dist folder).

.EXAMPLE
    .\deploy.ps1 -ResourceGroupName "rg-letssora-dev" -WebAppName "app-letssora-dev"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$ResourceGroupName = "rg-letssora-dev",

    [Parameter(Mandatory = $false)]
    [string]$WebAppName = "app-letssora-dev",

    [Parameter(Mandatory = $false)]
    [switch]$SkipClientBuild
)

$ErrorActionPreference = "Stop"

# Directories
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ClientDir = Join-Path $RepoRoot "client"
$ServerDir = Join-Path $RepoRoot "server"
$OutputDir = Join-Path $RepoRoot "deploy"
$ZipPath = Join-Path $OutputDir "app.zip"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "LetsSora Azure App Service Deployment" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Resource Group: $ResourceGroupName"
Write-Host "Web App:        $WebAppName"
Write-Host ""

# Verify Azure CLI
Write-Host "Checking Azure CLI..." -ForegroundColor Yellow
try {
    $account = az account show 2>&1 | ConvertFrom-Json
    Write-Host "Logged in: $($account.user.name)" -ForegroundColor Green
}
catch {
    Write-Error "Please run 'az login' first."
    exit 1
}

# Clean output directory
if (Test-Path $OutputDir) { Remove-Item -Path $OutputDir -Recurse -Force }
New-Item -Path $OutputDir -ItemType Directory -Force | Out-Null

# Step 1: Build React client (required - Vite needs to compile)
if (-not $SkipClientBuild) {
    Write-Host ""
    Write-Host "Building React client..." -ForegroundColor Yellow
    Push-Location $ClientDir
    try {
        npm install
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "Client build failed" }
        Write-Host "Client built!" -ForegroundColor Green
    }
    finally { Pop-Location }
}

# Verify client dist exists
$ClientDistDir = Join-Path $ClientDir "dist"
if (-not (Test-Path $ClientDistDir)) {
    Write-Error "Client dist not found. Run without -SkipClientBuild first."
    exit 1
}

# Step 2: Create deployment package (source only, no node_modules)
Write-Host ""
Write-Host "Creating deployment package..." -ForegroundColor Yellow

# Copy server source (no node_modules - Azure will install)
Copy-Item -Path (Join-Path $ServerDir "*.js") -Destination $OutputDir -Force
Copy-Item -Path (Join-Path $ServerDir "package.json") -Destination $OutputDir -Force
Copy-Item -Path (Join-Path $ServerDir "package-lock.json") -Destination $OutputDir -Force -ErrorAction SilentlyContinue

# Copy client dist (pre-built static files)
$OutputClientDist = Join-Path $OutputDir "client" "dist"
New-Item -Path $OutputClientDist -ItemType Directory -Force | Out-Null
Copy-Item -Path "$ClientDistDir\*" -Destination $OutputClientDist -Recurse -Force

Write-Host "Package contents:"
Get-ChildItem $OutputDir -Recurse | ForEach-Object { 
    $relativePath = $_.FullName.Replace($OutputDir, "").TrimStart("\")
    if ($_.PSIsContainer) { Write-Host "  [DIR] $relativePath" } 
    else { Write-Host "  $relativePath" }
}

# Step 3: Create zip
Write-Host ""
Write-Host "Creating zip..." -ForegroundColor Yellow
Push-Location $OutputDir
Compress-Archive -Path ".\*" -DestinationPath $ZipPath -Force
Pop-Location

$zipSize = [math]::Round((Get-Item $ZipPath).Length / 1KB, 1)
Write-Host "Zip created: $zipSize KB" -ForegroundColor Green

# Step 4: Configure App Service for Oryx build
Write-Host ""
Write-Host "Configuring App Service..." -ForegroundColor Yellow
az webapp config appsettings set `
    --resource-group $ResourceGroupName `
    --name $WebAppName `
    --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true | Out-Null

# Step 5: Deploy
Write-Host ""
Write-Host "Deploying to Azure (Oryx will install dependencies)..." -ForegroundColor Yellow

az webapp deployment source config-zip `
    --resource-group $ResourceGroupName `
    --name $WebAppName `
    --src $ZipPath `
    --timeout 600

if ($LASTEXITCODE -ne 0) { 
    Write-Error "Deployment failed"
    exit 1
}

# Done
$appUrl = "https://$WebAppName.azurewebsites.net"
Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "Deployed! $appUrl" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "Note: First deployment may take a few minutes while Oryx installs dependencies."
Write-Host "Check logs: az webapp log tail -g $ResourceGroupName -n $WebAppName"
