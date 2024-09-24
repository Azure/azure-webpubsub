targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the the environment which is used to generate a short unique hash used in all resources.')
param environmentName string

@minLength(1)
@description('Primary location for all resources')
@allowed(['australiaeast', 'eastasia', 'eastus', 'eastus2', 'northeurope', 'southcentralus', 'southeastasia', 'swedencentral', 'uksouth', 'westus2'])
@metadata({
  azd: {
    type: 'location'
  }
})
param location string

param functionServiceName string = ''
param functionUserAssignedIdentityName string = ''
param applicationInsightsName string = ''
param appServicePlanName string = ''
param logAnalyticsName string = ''
param resourceGroupName string = ''
param storageAccountName string = ''

var abbrs = loadJsonContent('./abbreviations.json')
var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var tags = { 'azd-env-name': environmentName }
var functionName = !empty(functionServiceName) ? functionServiceName : '${abbrs.webSitesFunctions}processor-${resourceToken}'

// Organize resources in a resource group
resource rg 'Microsoft.Resources/resourceGroups@2021-04-01' = {
  name: !empty(resourceGroupName) ? resourceGroupName : '${abbrs.resourcesResourceGroups}${environmentName}'
  location: location
  tags: tags
}

// User assigned managed identity to be used by the Function App to reach storage and service bus
module processorUserAssignedIdentity './core/identity/userAssignedIdentity.bicep' = {
  name: 'processorUserAssignedIdentity'
  scope: rg
  params: {
    location: location
    tags: tags
    identityName: !empty(functionUserAssignedIdentityName) ? functionUserAssignedIdentityName : '${abbrs.managedIdentityUserAssignedIdentities}processor-${resourceToken}'
  }
}

// Create an application used in Azure Function authenication and it uses the previously created managed identity as federated identity
module federatedApplication './core/identity/federatedIdentity.bicep' = {
  name: 'federatedApplication'
  scope: rg
  params: {
    identityName: '${abbrs.servicePrincipal}api-${resourceToken}'
    federatedIdentityObjectId: processorUserAssignedIdentity.outputs.identityPrincipalId
    redirectUri: 'https://${functionName}.azurewebsites.net/.auth/login/aad/callback'
  }
}

module socketio './app/socketio.bicep' = {
  name: 'socketio'
  scope: rg
  params: {
    name:'${abbrs.socketio}${resourceToken}'
    location: location
    identityId: processorUserAssignedIdentity.outputs.identityId
  }
}

// The application backend
module function './app/function.bicep' = {
  name: 'function'
  scope: rg
  params: {
    name: functionName
    location: location
    tags: tags
    applicationInsightsName:!empty(applicationInsightsName) ? applicationInsightsName : '${abbrs.insightsComponents}${resourceToken}'
    logAnalyticsName: !empty(logAnalyticsName) ? logAnalyticsName : '${abbrs.operationalInsightsWorkspaces}${resourceToken}'
    workerRuntime: 'node'
    identityId: processorUserAssignedIdentity.outputs.identityId
    identityClientId: processorUserAssignedIdentity.outputs.identityClientId
    identityPrincipalId: processorUserAssignedIdentity.outputs.identityPrincipalId
    authApplicationClientId: federatedApplication.outputs.applicationClientId
    storageName: !empty(storageAccountName) ? storageAccountName : '${abbrs.storageStorageAccounts}${resourceToken}'
    appServicePlanName: !empty(appServicePlanName) ? appServicePlanName : '${abbrs.webServerFarms}${resourceToken}'
    socketIOEndpoint: 'https://${socketio.outputs.uri}'
    appSettings: {
    }
  }
}

var WebPubSubServiceOwnerDefinitionId = '12cf5a90-567b-43ae-8102-96cf46c7d9b4' // Web PubSub Service Owner role ID

// Allow access from processor to socketio using a managed identity
module socketioRoleAssignmentApi './core/identity/role.bicep' = {
  name: 'socketio-owner'
  scope: rg
  params: {
    principalId: processorUserAssignedIdentity.outputs.identityPrincipalId
    roleDefinitionId: WebPubSubServiceOwnerDefinitionId
    principalType: 'ServicePrincipal'
  }
}

// App outputs
output functionName string = function.outputs.SERVICE_PROCESSOR_NAME
output resourceGroup string = rg.name
output socketioName string = socketio.outputs.name
output funcAuthClientId string = federatedApplication.outputs.applicationClientId

// For azd
output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = tenant().tenantId
output SERVICE_PROCESSOR_NAME string = function.outputs.SERVICE_PROCESSOR_NAME
