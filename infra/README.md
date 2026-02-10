# Infrastructure Deployment

This folder contains Bicep templates for deploying the LetsSora application to Azure App Service with managed identity integration for Azure AI Foundry.

## Architecture

The deployment creates the following resources:

- **App Service Plan** (Linux): Hosts the web application
- **App Service**: The web application with system-assigned managed identity, configured for Node.js zip deployment
- **Role Assignment**: Grants the "Azure AI User" role to the managed identity on the AI Foundry project

## Prerequisites

1. **Azure CLI** installed and authenticated
2. **Node.js 20+** installed locally for building
3. **Azure subscription** with appropriate permissions
4. **Azure AI Foundry project** already created
5. **Resource Group** created in your target region

## Configuration

Before deploying, update the parameters in `main.bicepparam`:

1. **aiFoundryProjectId**: Set this to your Azure AI Foundry project resource ID
   - Format: `/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.MachineLearningServices/workspaces/{projectName}`
   - You can find this in the Azure Portal under your AI Foundry project's Properties

2. **azureOpenAiEndpoint**: Your Azure OpenAI endpoint URL

3. **azureFoundryEndpoint**: Your Azure AI Foundry inference endpoint URL

4. **appName**: The base name for your application resources (default: `letssora`)

5. **environment**: The deployment environment (`dev`, `staging`, or `prod`)

6. **appServicePlanSku**: The pricing tier for App Service (default: `B1`)

## Deployment

### Step 1: Provision Infrastructure

```bash
# Login to Azure
az login

# Set your subscription
az account set --subscription "<your-subscription-id>"

# Create a resource group (if not exists)
az group create --name rg-letssora-dev --location eastus

# Validate the deployment
az deployment group what-if \
  --name letssora-deployment \
  --resource-group rg-letssora-dev \
  --template-file infra/main.bicep \
  --parameters infra/main.bicepparam

# Deploy the infrastructure
az deployment group create \
  --name letssora-deployment \
  --resource-group rg-letssora-dev \
  --template-file infra/main.bicep \
  --parameters infra/main.bicepparam
```

### Step 2: Deploy Application Code (Zip Deploy)

Use the provided PowerShell deployment script:

```powershell
# From the repository root
.\scripts\deploy.ps1 -ResourceGroupName "rg-letssora-dev" -WebAppName "app-letssora-dev"

# Or skip build if you've already built:
.\scripts\deploy.ps1 -ResourceGroupName "rg-letssora-dev" -WebAppName "app-letssora-dev" -SkipBuild
```

The script will:
1. Build the React client with Vite
2. Install production server dependencies
3. Package everything into a zip file
4. Deploy to Azure App Service using zip deployment

### Alternative: Using Azure Developer CLI (azd)

```bash
# Initialize azd (if not already done)
azd init

# Provision infrastructure
azd provision --preview  # Validate first
azd provision

# Deploy the application
azd deploy
```

## Post-Deployment

After successful deployment:

1. **Verify the app is running**: Visit `https://app-letssora-dev.azurewebsites.net`
2. **Check health endpoint**: `https://app-letssora-dev.azurewebsites.net/api/health`
3. **View logs**: Use Azure Portal or `az webapp log tail --resource-group rg-letssora-dev --name app-letssora-dev`

## Security Considerations

- **Managed Identity**: The application uses system-assigned managed identity, eliminating the need for stored credentials
- **HTTPS Only**: The App Service is configured to accept only HTTPS requests
- **TLS 1.2+**: Minimum TLS version is set to 1.2
- **FTPS Disabled**: FTP/FTPS deployment is disabled for security
- **No Secrets in Code**: Azure AI credentials are handled via managed identity

## Role Assignment Details

The "Azure AI User" role (`a97b65f3-24c7-4388-baec-2e87135dc908`) grants the following permissions:

- Read access to AI Foundry project resources
- Execute inference operations
- Access to model deployments

This is the principle of least privilege for applications that need to call AI models.

## Troubleshooting

### Common Issues

1. **Role Assignment Failed**: Ensure you have Owner or User Access Administrator role on the AI Foundry project's resource group

2. **Cross-subscription deployment**: If your AI Foundry project is in a different subscription, you may need to modify the deployment to use subscription-level scope

3. **Managed Identity not working**: After deployment, it may take a few minutes for the managed identity to propagate

4. **App not starting**: Check the startup logs:
   ```bash
   az webapp log tail --resource-group rg-letssora-dev --name app-letssora-dev
   ```

5. **Static files not served**: Ensure the client build output is in `client/dist` and the server is configured to serve them

## Resources

- [Azure App Service Documentation](https://docs.microsoft.com/azure/app-service/)
- [Azure Managed Identities](https://docs.microsoft.com/azure/active-directory/managed-identities-azure-resources/)
- [Azure AI Foundry Documentation](https://docs.microsoft.com/azure/ai-studio/)
- [Bicep Documentation](https://docs.microsoft.com/azure/azure-resource-manager/bicep/)
- [Zip Deploy for App Service](https://docs.microsoft.com/azure/app-service/deploy-zip)
