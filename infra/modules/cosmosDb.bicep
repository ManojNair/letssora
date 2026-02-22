@description('The name of the Cosmos DB account')
param accountName string

@description('The location for the Cosmos DB account')
param location string = resourceGroup().location

@description('The name of the database')
param databaseName string = 'letssora'

@description('The name of the container')
param containerName string = 'generations'

@description('Tags for the resources')
param tags object = {}

@description('The principal ID to assign the Cosmos DB Data Contributor role to (optional)')
param appPrincipalId string = ''

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2023-11-15' = {
  name: accountName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    disableLocalAuth: false
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-11-15' = {
  parent: cosmosAccount
  name: databaseName
  properties: {
    resource: {
      id: databaseName
    }
  }
}

resource container 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  parent: database
  name: containerName
  properties: {
    resource: {
      id: containerName
      partitionKey: {
        paths: [
          '/userId'
        ]
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [
          {
            path: '/*'
          }
        ]
        excludedPaths: [
          {
            path: '/"_etag"/?'
          }
        ]
      }
    }
  }
}

// Cosmos DB Built-in Data Contributor Role Assignment
// Uses 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments' (not Azure RBAC)
resource cosmosDataContributorRole 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2023-11-15' = if (appPrincipalId != '') {
  name: guid(cosmosAccount.id, appPrincipalId, '00000000-0000-0000-0000-000000000002')
  parent: cosmosAccount
  properties: {
    roleDefinitionId: '${cosmosAccount.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'
    principalId: appPrincipalId
    scope: cosmosAccount.id
  }
}

@description('The Cosmos DB account endpoint')
output endpoint string = cosmosAccount.properties.documentEndpoint

@description('The Cosmos DB account name')
output accountName string = cosmosAccount.name

@description('The Cosmos DB account principal ID')
output principalId string = cosmosAccount.id

@description('The database name')
output databaseNameOutput string = databaseName
