// Web App module
// Creates an Azure App Service with System-Assigned Managed Identity
// Configured for Node.js zip deployment

@description('The name of the Web App')
param name string

@description('The location for the Web App')
param location string

@description('The resource ID of the App Service Plan')
param appServicePlanId string

@description('Tags to apply to the resource')
param tags object = {}

@description('The Node.js version to use')
param nodeVersion string = '20-lts'

@description('Azure OpenAI/Foundry endpoint URL')
param azureOpenAiEndpoint string = ''

@description('Azure AI Foundry endpoint URL')
param azureFoundryEndpoint string = ''

@description('Sora model deployment name')
param soraModelDeployment string = 'sora-2'

@description('Image model deployment name')
param imageModelDeployment string = 'gpt-image-1'

@description('Additional application settings')
param additionalAppSettings array = []

resource webApp 'Microsoft.Web/sites@2024-11-01' = {
  name: name
  location: location
  tags: tags
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlanId
    httpsOnly: true
    clientAffinityEnabled: false
    publicNetworkAccess: 'Enabled'
    siteConfig: {
      linuxFxVersion: 'NODE|${nodeVersion}'
      alwaysOn: true
      http20Enabled: true
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      // Startup command for the Node.js app (index.js at root level)
      appCommandLine: 'node index.js'
      appSettings: concat([
        // Node.js configuration
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~20'
        }
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        // Zip deployment configuration - skip build since we pre-build
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'false'
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '0'
        }
        // Azure AI configuration
        {
          name: 'AZURE_OPENAI_ENDPOINT'
          value: azureOpenAiEndpoint
        }
        {
          name: 'AZURE_FOUNDRY_ENDPOINT'
          value: azureFoundryEndpoint
        }
        {
          name: 'SORA_MODEL_DEPLOYMENT'
          value: soraModelDeployment
        }
        {
          name: 'IMAGE_MODEL_DEPLOYMENT'
          value: imageModelDeployment
        }
      ], additionalAppSettings)
    }
  }
}

// Outputs
output id string = webApp.id
output name string = webApp.name
output defaultHostName string = webApp.properties.defaultHostName
output principalId string = webApp.identity.principalId
output tenantId string = webApp.identity.tenantId
