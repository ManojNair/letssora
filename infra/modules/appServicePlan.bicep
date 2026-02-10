// App Service Plan module
// Creates an App Service Plan for hosting the web application

@description('The name of the App Service Plan')
param name string

@description('The location for the App Service Plan')
param location string

@description('The SKU for the App Service Plan')
param sku string

@description('Tags to apply to the resource')
param tags object = {}

// Determine the tier based on SKU
var skuTier = sku == 'F1' ? 'Free' : startsWith(sku, 'B') ? 'Basic' : startsWith(sku, 'S') ? 'Standard' : startsWith(sku, 'P') ? 'Premium' : 'Standard'

resource appServicePlan 'Microsoft.Web/serverfarms@2024-11-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: sku
    tier: skuTier
    capacity: 1
  }
  properties: {
    reserved: true // Required for Linux
  }
  kind: 'linux'
}

// Outputs
output id string = appServicePlan.id
output name string = appServicePlan.name
