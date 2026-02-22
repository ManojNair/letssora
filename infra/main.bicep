// Main Bicep template for deploying the LetsSora application to Azure App Service
// This template creates an App Service with managed identity and assigns the "Azure AI User" role
// to allow the application to call into Azure AI Foundry

targetScope = 'resourceGroup'

// Parameters
@description('The location for all resources')
param location string = resourceGroup().location

@description('The name of the application (used as base name for resources)')
@minLength(3)
@maxLength(20)
param appName string = 'letssora'

@description('The environment name (dev, staging, prod)')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'dev'

@description('The SKU for the App Service Plan')
@allowed(['B1', 'B2', 'B3', 'S1', 'S2', 'S3', 'P1v2', 'P2v2', 'P3v2', 'P1v3', 'P2v3', 'P3v3'])
param appServicePlanSku string = 'P2v3'

@description('The resource ID of the Azure AI Foundry project to grant access to')
param aiFoundryProjectId string

@description('The Azure OpenAI endpoint URL')
param azureOpenAiEndpoint string = 'https://letsaifoundryprj-resource.openai.azure.com/openai/v1/'

@description('The Azure AI Foundry endpoint URL')
param azureFoundryEndpoint string = 'https://letsaifoundryprj-resource.services.ai.azure.com/api/projects/letsaifoundryprj'

@description('The Sora model deployment name')
param soraModelDeployment string = 'sora-2'

@description('The image model deployment name')
param imageModelDeployment string = 'gpt-image-1.5'

@description('Skip the AI Foundry role assignment (set to true if the AI Foundry project is in a different tenant)')
param skipAiRoleAssignment bool = false

@description('Tags to apply to all resources')
param tags object = {
  application: appName
  environment: environment
}

// Variables
var suffix = uniqueString(resourceGroup().id)
var resourceBaseName = '${appName}-${environment}'
var appServicePlanName = 'asp-${resourceBaseName}-${suffix}'
var webAppName = 'app-${resourceBaseName}-${suffix}'
var cosmosAccountName = 'cosmos-${resourceBaseName}-${suffix}'
var storageAccountName = take(replace('st${resourceBaseName}${suffix}', '-', ''), 24)

// Azure Cognitive User Role Definition ID (built-in role)
// Role ID: 53ca6127-db72-4b80-b1b0-d745d6d5456d
var azureAiUserRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '53ca6127-db72-4b80-b1b0-d745d6d5456d')


// Storage Blob Data Contributor Role Definition ID
// Role ID: ba92f5b4-2d11-453d-a403-e96b0029c9fe
var storageBlobDataContributorRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')

// App Service Plan
module appServicePlan 'modules/appServicePlan.bicep' = {
  name: 'appServicePlan'
  params: {
    name: appServicePlanName
    location: location
    sku: appServicePlanSku
    tags: tags
  }
}

// Cosmos DB (serverless, NoSQL)
module cosmosDb 'modules/cosmosDb.bicep' = {
  name: 'cosmosDb'
  params: {
    accountName: cosmosAccountName
    location: location
    databaseName: 'letssora'
    containerName: 'generations'
    tags: tags
  }
}

// Storage Account for media blobs
module storageAccount 'modules/storageAccount.bicep' = {
  name: 'storageAccount'
  params: {
    storageAccountName: storageAccountName
    location: location
    containerName: 'media'
    tags: tags
  }
}

// Web App with Managed Identity
module webApp 'modules/webApp.bicep' = {
  name: 'webApp'
  params: {
    name: webAppName
    location: location
    appServicePlanId: appServicePlan.outputs.id
    tags: tags
    azureOpenAiEndpoint: azureOpenAiEndpoint
    azureFoundryEndpoint: azureFoundryEndpoint
    soraModelDeployment: soraModelDeployment
    imageModelDeployment: imageModelDeployment
    additionalAppSettings: [
      {
        name: 'COSMOS_DB_ENDPOINT'
        value: cosmosDb.outputs.endpoint
      }
      {
        name: 'COSMOS_DB_DATABASE'
        value: cosmosDb.outputs.databaseNameOutput
      }
      {
        name: 'AZURE_STORAGE_ACCOUNT_NAME'
        value: storageAccount.outputs.storageAccountNameOutput
      }
      {
        name: 'AZURE_STORAGE_CONTAINER_NAME'
        value: storageAccount.outputs.containerNameOutput
      }
    ]
  }
}

// Role Assignment - Azure AI User on AI Foundry Project
// This grants the web app's managed identity the "Azure AI User" role
// Skip if the AI Foundry project is in a different tenant (assign manually instead)
module roleAssignment 'modules/roleAssignment.bicep' = if (!skipAiRoleAssignment) {
  name: 'aiUserRoleAssignment'
  scope: resourceGroup(split(aiFoundryProjectId, '/')[2], split(aiFoundryProjectId, '/')[4])
  params: {
    principalId: webApp.outputs.principalId
    roleDefinitionId: azureAiUserRoleDefinitionId
    principalType: 'ServicePrincipal'
    resourceId: aiFoundryProjectId
  }
}



// Role Assignment - Storage Blob Data Contributor
module storageRoleAssignment 'modules/roleAssignment.bicep' = {
  name: 'storageBlobRoleAssignment'
  params: {
    principalId: webApp.outputs.principalId
    roleDefinitionId: storageBlobDataContributorRoleId
    principalType: 'ServicePrincipal'
    resourceId: storageAccount.outputs.storageAccountId
  }
}

// Role Assignment - Cosmos DB Built-in Data Contributor
// Cosmos DB uses its own RBAC system, not Azure RBAC
resource cosmosDbAccount 'Microsoft.DocumentDB/databaseAccounts@2023-11-15' existing = {
  name: cosmosAccountName
}

resource cosmosDbRoleAssignment 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2023-11-15' = {
  name: guid(cosmosDbAccount.id, webAppName, '00000000-0000-0000-0000-000000000002')
  parent: cosmosDbAccount
  properties: {
    roleDefinitionId: '${cosmosDbAccount.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'
    principalId: webApp.outputs.principalId
    scope: cosmosDbAccount.id
  }
}

// Outputs
output webAppName string = webApp.outputs.name
output webAppHostName string = webApp.outputs.defaultHostName
output webAppPrincipalId string = webApp.outputs.principalId
output appServicePlanId string = appServicePlan.outputs.id
output cosmosDbEndpoint string = cosmosDb.outputs.endpoint
output storageAccountName string = storageAccount.outputs.storageAccountNameOutput
