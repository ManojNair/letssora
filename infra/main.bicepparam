// Bicep Parameters file for main.bicep
// Configure these values for your deployment

using './main.bicep'

// The name of your application
param appName = 'letssora'

// The environment to deploy to
param environment = 'dev'
param location = 'australiaeast'
// The SKU for the App Service Plan
// Options: F1 (Free), B1, B2, B3, S1, S2, S3, P1v2, P2v2, P3v2, P1v3, P2v3, P3v3
// Note: F1 is free but has limitations (no always-on, limited CPU). S1 is recommended for production.
param appServicePlanSku = 'B1'

// The resource ID of your Azure AI Foundry project
// Format: /subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.MachineLearningServices/workspaces/{projectName}
param aiFoundryProjectId = '/subscriptions/9ac8d967-43ea-4ac3-9276-8d3a35ed6259/resourceGroups/client-demo-rsg/providers/Microsoft.CognitiveServices/accounts/aifoundry-project-resource/projects/aifoundry-project'

// Azure OpenAI/Foundry endpoint URL
param azureOpenAiEndpoint = 'https://letssoraprj-resource.openai.azure.com'

// Azure AI Foundry endpoint URL (for inference)
param azureFoundryEndpoint = 'https://letssoraprj-resource.services.ai.azure.com'

// Model deployment names
param soraModelDeployment = 'sora-2'
param imageModelDeployment = 'gpt-image-1'

// Optional: Override the location (defaults to resource group location)
// param location = 'eastus'

// Optional: Add custom tags
// param tags = {
//   application: 'letssora'
//   environment: 'dev'
//   costCenter: 'IT'
// }
