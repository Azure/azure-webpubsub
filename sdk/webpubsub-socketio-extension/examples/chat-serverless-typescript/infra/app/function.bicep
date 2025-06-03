param name string
param location string = resourceGroup().location
param tags object = {}
param applicationInsightsName string
param logAnalyticsName string
param appSettings object = {}
@allowed([
  'dotnet', 'node', 'python', 'java', 'powershell', 'custom'
])
param workerRuntime string
param identityId string
param identityClientId string
param identityPrincipalId string
param socketIOEndpoint string
param authApplicationClientId string

param storageName string
param appServicePlanName string

var applicationInsightsIdentity = 'ClientId=${identityClientId};Authorization=AAD'
param serviceName string = 'sioserverless'
var containers = [{name: 'deploymentpackage'}]
// Create an Azure Storage account, which is required by Functions.
resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageName
  location: location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: true
    publicNetworkAccess: 'Enabled'
    allowSharedKeyAccess: true // Azure files doesn't support identity based auth
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
  }

  resource blobServices 'blobServices' =  {
    name: 'default'
    resource container 'containers' = [for container in containers: {
      name: container.name
      properties: {
        publicAccess: 'None'
      }
    }]
  }
}

var storageRoleDefinitionId  = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b' //Storage Blob Data Owner role

// Allow access from function to storage account using a managed identity
module storageRoleAssignmentApi './storage-Access.bicep' = {
  name: 'storageRoleAssignmentApi'
  params: {
    storageAccountName: storage.name
    roleDefinitionID: storageRoleDefinitionId
    principalID: identityPrincipalId
  }
}

// Monitor application with Azure Monitor
module monitoring '../core/monitor/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    location: location
    tags: tags
    logAnalyticsName: logAnalyticsName
    applicationInsightsName: applicationInsightsName
    disableLocalAuth: true
  }
}

var monitoringRoleDefinitionId = '3913510d-42f4-4e42-8a64-420c390055eb' // Monitoring Metrics Publisher role ID

// Allow access from function to application insights using a managed identity
module appInsightsRoleAssignmentApi '../core/monitor/appinsights-access.bicep' = {
  name: 'appInsightsRoleAssignmentApi'
  params: {
    appInsightsName: monitoring.outputs.applicationInsightsName
    roleDefinitionID: monitoringRoleDefinitionId
    principalID: identityPrincipalId
  }
}

// Create a Windows serverless Consumption hosting plan for the function app.
module appServicePlan '../core/host/appserviceplan.bicep' = {
  name: 'appserviceplan'
  params: {
    name: appServicePlanName
    location: location
    tags: tags
    sku: {
      name: 'Y1'
      tier: 'Dynamic'
    }
  }
}

resource functions 'Microsoft.Web/sites@2023-12-01' = {
  name: name
  location: location
  tags: union(tags, { 'azd-service-name': serviceName })
  kind: 'functionapp'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { 
      '${identityId}': {}
    }
  }
  properties: {
    serverFarmId: appServicePlan.outputs.id
  }

  resource configAppSettings 'config' = {
    name: 'appsettings'
    properties: union(appSettings,
      {
        FUNCTIONS_WORKER_RUNTIME: workerRuntime
        WEBSITE_NODE_DEFAULT_VERSION: workerRuntime == 'node' ? '~20' : ''

        FUNCTIONS_EXTENSION_VERSION: '~4'
        WEBSITE_CONTENTAZUREFILECONNECTIONSTRING: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storage.listKeys().keys[0].value}'
        WEBSITE_CONTENTSHARE: toLower(name)

        AzureWebJobsStorage__accountName: storage.name
        AzureWebJobsStorage__credential : 'managedidentity'
        AzureWebJobsStorage__clientId : identityClientId

        APPLICATIONINSIGHTS_CONNECTION_STRING: monitoring.outputs.applicationInsightsConnectionString
        APPLICATIONINSIGHTS_AUTHENTICATION_STRING: applicationInsightsIdentity

        OVERRIDE_USE_MI_FIC_ASSERTION_CLIENTID: identityClientId
        
        WebPubSubForSocketIOConnectionString__endpoint: socketIOEndpoint
        WebPubSubForSocketIOConnectionString__clientId: identityClientId
        WebPubSubForSocketIOConnectionString__credential: 'managedidentity'
      })
  }

  resource authSettings 'config' = {
    name: 'authsettingsV2'
    properties: {
      globalValidation: {
        requireAuthentication: true
        unauthenticatedClientAction: 'RedirectToLoginPage'
        redirectToProvider: 'azureActiveDirectory'
      }
      identityProviders: {
        azureActiveDirectory: {
          enabled: true
          registration: {
            openIdIssuer: '${environment().authentication.loginEndpoint}${subscription().tenantId}/v2.0'
            clientId: authApplicationClientId
            clientSecretSettingName: 'OVERRIDE_USE_MI_FIC_ASSERTION_CLIENTID'
          }
          validation: {
            allowedAudiences: [
              authApplicationClientId
            ]
            defaultAuthorizationPolicy: {
              allowedApplications: [
                authApplicationClientId
                identityClientId
              ]
            }
          }
        }
      }
    }
  }
}

output SERVICE_SIOSERVERLESS_NAME string = functions.name
output APPLICATIONINSIGHTS_CONNECTION_STRING string = monitoring.outputs.applicationInsightsConnectionString
