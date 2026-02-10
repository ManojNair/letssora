// Role Assignment module
// Assigns a role to a principal (managed identity) on a specific resource

@description('The principal ID (managed identity) to assign the role to')
param principalId string

@description('The role definition ID to assign')
param roleDefinitionId string

@description('The type of principal')
@allowed(['ServicePrincipal', 'User', 'Group', 'ForeignGroup'])
param principalType string = 'ServicePrincipal'

@description('The resource ID to scope the role assignment to')
param resourceId string

// Generate a unique name for the role assignment based on the principal, role, and resource
var roleAssignmentName = guid(principalId, roleDefinitionId, resourceId)

resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: roleAssignmentName
  properties: {
    principalId: principalId
    roleDefinitionId: roleDefinitionId
    principalType: principalType
  }
}

// Outputs
output id string = roleAssignment.id
output name string = roleAssignment.name
