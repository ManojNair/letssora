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
param appServicePlanSku string = 'B1'

@description('The resource ID of the Azure AI Foundry project to grant access to')
param aiFoundryProjectId string

@description('The Azure OpenAI endpoint URL')
param azureOpenAiEndpoint string = ''

@description('The Azure AI Foundry endpoint URL')
param azureFoundryEndpoint string = ''

@description('The Sora model deployment name')
param soraModelDeployment string = 'sora-2'

@description('The image model deployment name')
param imageModelDeployment string = 'gpt-image-1'

@description('Tags to apply to all resources')
param tags object = {
  application: appName
  environment: environment
}

// Variables
var resourceBaseName = '${appName}-${environment}'
var appServicePlanName = 'asp-${resourceBaseName}'
var webAppName = 'app-${resourceBaseName}'

// Azure Cognitive User Role Definition ID (built-in role)
// Role ID: 53ca6127-db72-4b80-b1b0-d745d6d5456d
var azureAiUserRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '53ca6127-db72-4b80-b1b0-d745d6d5456d')

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
  }
}

// Role Assignment - Azure AI User on AI Foundry Project
// This grants the web app's managed identity the "Azure AI User" role
module roleAssignment 'modules/roleAssignment.bicep' = {
  name: 'aiUserRoleAssignment'
  scope: resourceGroup(split(aiFoundryProjectId, '/')[2], split(aiFoundryProjectId, '/')[4])
  params: {
    principalId: webApp.outputs.principalId
    roleDefinitionId: azureAiUserRoleDefinitionId
    principalType: 'ServicePrincipal'
    resourceId: aiFoundryProjectId
  }
}

// Outputs
output webAppName string = webApp.outputs.name
output webAppHostName string = webApp.outputs.defaultHostName
output webAppPrincipalId string = webApp.outputs.principalId
output appServicePlanId string = appServicePlan.outputs.id
