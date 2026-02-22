# Infrastructure Deployment

This folder contains Bicep templates for deploying the LetsSora application to Azure.

## Architecture

The deployment creates the following resources:

- **App Service Plan** (Linux): Hosts the web application
- **App Service**: Node.js 22 web app with system-assigned managed identity
- **Azure Cosmos DB** (Serverless, NoSQL): Stores conversation history
- **Azure Storage Account**: Stores full-resolution media blobs (images/videos)
- **Role Assignments**:
  - Cosmos DB Built-in Data Contributor (via `sqlRoleAssignments`)
  - Storage Blob Data Contributor (via Azure RBAC)
  - Azure AI User on AI Foundry project (optional, via Azure RBAC)

## Prerequisites

1. **Azure CLI** installed and authenticated (`az login`)
2. **Node.js 20+** installed locally (for client build)
3. **PowerShell 7+** (for the deploy script)
4. **Azure subscription** with Contributor role
5. **Azure AI Foundry project** with Sora 2 and GPT Image models deployed
6. **Resource Group** created in your target region

## Configuration

Update `main.bicepparam` before deploying:

| Parameter | Description | Example |
|-----------|-------------|---------|
| `appName` | Base name for all resources (a unique suffix is auto-appended) | `letssora` |
| `environment` | Deployment environment | `dev`, `staging`, `prod` |
| `location` | Azure region | `australiaeast` |
| `appServicePlanSku` | App Service pricing tier | `P2v3` (prod), `B1` (dev) |
| `aiFoundryProjectId` | Full resource ID of your AI Foundry project | `/subscriptions/.../projects/...` |
| `azureOpenAiEndpoint` | Azure OpenAI endpoint URL (no trailing slash) | `https://myresource.openai.azure.com` |
| `azureFoundryEndpoint` | Azure AI Foundry inference endpoint | `https://myresource.services.ai.azure.com` |
| `soraModelDeployment` | Sora model deployment name | `sora-2` |
| `imageModelDeployment` | Image model deployment name | `gpt-image-1` |
| `skipAiRoleAssignment` | Skip AI Foundry role assignment (set `true` for cross-tenant) | `true` |

## Deployment

### Step 1: Login and Create Resource Group

```powershell
az login
az account set --subscription "<your-subscription-id>"
az group create --name rg-letssora-dev --location australiaeast
```

### Step 2: Preview the Deployment

```powershell
az deployment group what-if `
  --resource-group rg-letssora-dev `
  --template-file infra/main.bicep `
  --parameters infra/main.bicepparam
```

### Step 3: Provision Infrastructure

```powershell
az deployment group create `
  --resource-group rg-letssora-dev `
  --template-file infra/main.bicep `
  --parameters infra/main.bicepparam
```

This takes 3-5 minutes and creates all Azure resources with role assignments.

**After deployment completes**, capture the output values — resource names include a unique suffix and you'll need them for subsequent steps:

```powershell
$outputs = az deployment group show `
  --resource-group rg-letssora-dev `
  --name main `
  --query properties.outputs -o json | ConvertFrom-Json

$webAppName = $outputs.webAppName.value
$principalId = $outputs.webAppPrincipalId.value
$hostName = $outputs.webAppHostName.value

Write-Host "Web App Name: $webAppName"
Write-Host "Principal ID: $principalId"
Write-Host "URL: https://$hostName"
```

### Step 4: Assign AI Foundry Role Manually (if `skipAiRoleAssignment = true`)

If your AI Foundry project is in a different subscription or tenant, assign the role manually using the `$principalId` from Step 3:

```powershell
# If you didn't capture it in Step 3:
$principalId = (az deployment group show `
  --resource-group rg-letssora-dev `
  --name main `
  --query properties.outputs.webAppPrincipalId.value -o tsv)

# Assign Cognitive Services User role on your AI resource
az role assignment create `
  --assignee-object-id $principalId `
  --assignee-principal-type ServicePrincipal `
  --role "Cognitive Services User" `
  --scope "/subscriptions/{ai-sub-id}/resourceGroups/{ai-rg}/providers/Microsoft.CognitiveServices/accounts/{ai-account}"
```

### Step 5: Deploy Application Code

Use the web app name from the deployment output (Step 3):

```powershell
# If you didn't capture it in Step 3:
$webAppName = (az deployment group show `
  --resource-group rg-letssora-dev `
  --name main `
  --query properties.outputs.webAppName.value -o tsv)

# Deploy the app
.\scripts\deploy.ps1 -ResourceGroupName "rg-letssora-dev" -WebAppName $webAppName
```

The script will:
1. Build the React client with Vite
2. Package server source + client dist into a zip (no node_modules)
3. Deploy via zip deployment — Oryx installs dependencies on the server

> First deployment takes 3-5 minutes while npm packages are installed.

### Step 6: Verify

```powershell
# Get the hostname from deployment output
$hostName = (az deployment group show `
  --resource-group rg-letssora-dev `
  --name main `
  --query properties.outputs.webAppHostName.value -o tsv)

# Health check
Invoke-RestMethod "https://$hostName/api/health"
# Expected: status=ok, cosmosDb=True, blobStorage=True

# Stream logs
az webapp log tail -g rg-letssora-dev -n $webAppName
```

Visit: `https://$hostName`

## Redeployment

**Infrastructure changes** (Bicep modifications):
```powershell
az deployment group create `
  --resource-group rg-letssora-dev `
  --template-file infra/main.bicep `
  --parameters infra/main.bicepparam
```

**Code changes only** (no infra change needed):
```powershell
$webAppName = (az deployment group show `
  --resource-group rg-letssora-dev `
  --name main `
  --query properties.outputs.webAppName.value -o tsv)

.\scripts\deploy.ps1 -ResourceGroupName "rg-letssora-dev" -WebAppName $webAppName

# Skip client build if only server files changed:
.\scripts\deploy.ps1 -ResourceGroupName "rg-letssora-dev" -WebAppName $webAppName -SkipClientBuild
```

## Resource Naming Convention

All resource names include a unique suffix derived from `uniqueString(resourceGroup().id)` to ensure global uniqueness. Deploying to different resource groups automatically produces different names.

| Resource Type | Name Pattern | Example |
|--------------|-------------|----------|
| App Service Plan | `asp-{appName}-{env}-{suffix}` | `asp-letssora-dev-a1b2c3d4e5f6g` |
| Web App | `app-{appName}-{env}-{suffix}` | `app-letssora-dev-a1b2c3d4e5f6g` |
| Cosmos DB Account | `cosmos-{appName}-{env}-{suffix}` | `cosmos-letssora-dev-a1b2c3d4e5f6g` |
| Storage Account | `st{appName}{env}{suffix}` (max 24 chars) | `stletssoradeva1b2c3d4` |
## Security

- **Managed Identity**: System-assigned managed identity — no stored credentials
- **Cosmos DB RBAC**: Uses Cosmos DB built-in `sqlRoleAssignments` (not Azure RBAC)
- **HTTPS Only**: App Service configured to accept only HTTPS
- **TLS 1.2+**: Minimum TLS version set to 1.2
- **FTPS Disabled**: FTP/FTPS deployment disabled
- **No Public Blob Access**: Storage account disallows anonymous blob access

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Website with given name already exists` | App Service name collision (very unlikely with unique suffix) | Deploy to a new resource group or change `appName` |
| `CrossTenantDeploymentNotPermitted` | AI Foundry project is in a different tenant | Set `skipAiRoleAssignment = true`, assign role manually (Step 4) |
| `RoleDefinitionDoesNotExist` for Cosmos DB | Cosmos DB uses its own RBAC, not Azure RBAC | Already fixed — uses `sqlRoleAssignments` resource type |
| `Invalid request path` for Cosmos DB | Wrong resource type (e.g. `sqlContainers` instead of `containers`) | Already fixed — uses `containers` resource type |
| Health shows `cosmosDb: false` | Role assignment not propagated yet | Wait 2-3 minutes, or check Cosmos DB Data Contributor role |
| App shows "Application Error" | Code not deployed or startup failed | Run `deploy.ps1`, then check logs with `az webapp log tail` |
| Managed identity not working | Identity propagation delay | Wait a few minutes after first deployment |

## Resources

- [Azure App Service Documentation](https://docs.microsoft.com/azure/app-service/)
- [Azure Cosmos DB Documentation](https://docs.microsoft.com/azure/cosmos-db/)
- [Azure Managed Identities](https://docs.microsoft.com/azure/active-directory/managed-identities-azure-resources/)
- [Azure AI Foundry Documentation](https://docs.microsoft.com/azure/ai-studio/)
- [Bicep Documentation](https://docs.microsoft.com/azure/azure-resource-manager/bicep/)
- [Zip Deploy for App Service](https://docs.microsoft.com/azure/app-service/deploy-zip)
