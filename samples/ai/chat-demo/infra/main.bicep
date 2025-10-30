// App Service based infrastructure for Chat Demo (no Container Apps / Docker dependency)

@description('Base name/prefix for resources (keep it short + globally unique)')
param baseName string = 'chatdemo'
@description('Optional explicit web app name override (leave blank to use <baseName>-web)')
@minLength(0)
@maxLength(40)
param webAppNameOverride string = ''
@description('Azure location for all resources')
param location string = resourceGroup().location

@description('Web PubSub SKU')
@allowed(['Free_F1','Standard_S1'])
param webPubSubSku string = 'Free_F1'
@description('Web PubSub capacity (1 for Free tier)')
param webPubSubCapacity int = 1
@description('Web PubSub hub name used by the application')
param hubName string = 'demo_ai_chat'
@description('Optional explicit Web PubSub service name override (must be globally unique). Leave blank to auto-generate.')
@maxLength(63)
param webPubSubNameOverride string = ''
@description('Storage Account SKU')
param storageSku string = 'Standard_LRS'
@description('Azure Table name for chat messages (lowercase, no special chars)')
param chatTableName string = 'chatmessages'
@description('Role definition ID for Azure Web PubSub Service Owner (public cloud)')
param webPubSubRoleDefinitionId string = '12cf5a90-567b-43ae-8102-96cf46c7d9b4'
@description('Whether to create (or re-create) role assignments. Set to false to skip if roles already granted.')
param createRoleAssignments bool = true

@description('Optional GitHub Models token (PAT). Leave blank to skip adding as an app setting. Can be set later via azd provision or portal; prefer Key Vault for production.')
@secure()
param githubModelsToken string = ''

// Derived naming (avoid dashes where restricted)
var suffix = uniqueString(resourceGroup().id, baseName)
var storageAccountNameBase = toLower(replace('${baseName}${suffix}', '-', ''))
// Only truncate if length exceeds 24 (avoid substring length error on shorter strings)
var storageAccountName = length(storageAccountNameBase) > 24 ? substring(storageAccountNameBase, 0, 24) : storageAccountNameBase
// Web PubSub global uniqueness: append short hash when override not supplied
var webPubSubName = empty(webPubSubNameOverride) ? '${baseName}-wps-${substring(suffix,0,4)}' : webPubSubNameOverride
var planName = '${baseName}-plan'
var webAppName = empty(webAppNameOverride) ? '${baseName}-web-${substring(suffix,0,4)}' : webAppNameOverride

// Base App Settings
var appSettingsBase = [
  {
    name: 'TRANSPORT_MODE'
    value: 'webpubsub'
  }
  {
    name: 'STORAGE_MODE'
    value: 'table'
  }
  {
    // Prefer ManagedIdentityCredential in Azure runtime; set to false to fall back to DefaultAzureCredential.
    name: 'USE_MANAGED_IDENTITY'
    value: 'true'
  }
  {
    // Trigger Oryx remote build so requirements.txt is processed (otherwise zip deploy lacks deps)
    name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
    value: 'true'
  }
  {
    // Explicitly mark for Python platform (defensive; Oryx usually infers)
    name: 'ENABLE_ORYX_BUILD'
    value: 'true'
  }
  {
    name: 'WEBPUBSUB_ENDPOINT'
    value: 'https://${webPubSub.properties.hostName}'
  }
  {
    name: 'WEBPUBSUB_HUB'
    value: hubName
  }
  {
    name: 'AZURE_STORAGE_ACCOUNT'
    value: storage.name
  }
  {
    name: 'CHAT_TABLE_NAME'
    value: chatTableName
  }
]

// Conditionally include GitHub token if provided (non-empty)
var githubTokenSetting = empty(githubModelsToken) ? [] : [ {
  name: 'GITHUB_TOKEN'
  value: githubModelsToken
} ]

// Storage Account
resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: storageSku
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    // Enforce policy: prevent shared key access (AAD / RBAC only for data plane)
    allowSharedKeyAccess: false
  }
}


// Web PubSub Service
resource webPubSub 'Microsoft.SignalRService/webPubSub@2023-02-01' = {
  name: webPubSubName
  location: location
  sku: {
    name: webPubSubSku
    capacity: webPubSubCapacity
  }
  properties: {
    disableAadAuth: false
    // liveTraceConfiguration expects string values for enabled/disabled in this API version
    liveTraceConfiguration: {
      enabled: 'false'
    }
  }
}

resource hub 'Microsoft.SignalRService/webPubSub/hubs@2023-02-01' = {
  name: hubName
  parent: webPubSub
  properties: {

    eventHandlers: [
      {
        // For chat scenario we allow all events and user events.
        urlTemplate: 'https://${site.properties.defaultHostName}/eventhandler'
        userEventPattern: '*'
        systemEvents: [ 'connect', 'connected', 'disconnected' ]
      }
    ]
  }
}

// App Service Plan (Linux)
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

// Web App (Python) with System Assigned Managed Identity
resource site 'Microsoft.Web/sites@2023-12-01' = {
  name: webAppName
  location: location
  tags: {
    'azd-service-name': 'chatserver'
  }
  identity: {
    type: 'SystemAssigned'
  }
  kind: 'app,linux'
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'PYTHON|3.12'
      appSettings: concat(appSettingsBase, githubTokenSetting)
    }
  }
}

// Role Assignments (Managed Identity -> Web PubSub Owner & Storage Table Data Contributor)
var storageTableDataContributorRoleId = '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'

// Role assignment names are immutable. We cannot include principalId (not available for name at compile start) so
// if identity were recreated you may need to delete the old assignment or set createRoleAssignments=false after first success.
// Allow skipping via createRoleAssignments parameter.
resource raWebPubSub 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (createRoleAssignments) {
  name: guid(resourceGroup().id, 'webpubsub-role', site.name)
  scope: webPubSub
  properties: {
    principalId: site.identity.principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', webPubSubRoleDefinitionId)
    principalType: 'ServicePrincipal'
  }
}

resource raStorageTable 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (createRoleAssignments) {
  name: guid(resourceGroup().id, 'storage-table-role', site.name)
  scope: storage
  properties: {
    principalId: site.identity.principalId
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageTableDataContributorRoleId)
    principalType: 'ServicePrincipal'
  }
}

// Outputs consumed by azd (environment values)
output siteUrl string = 'https://${site.properties.defaultHostName}'
output webAppName string = site.name
output negotiateEndpoint string = 'https://${site.properties.defaultHostName}/negotiate'
output webPubSubHost string = 'https://${webPubSub.properties.hostName}'
output storageAccountName string = storage.name
output chatTableNameOut string = chatTableName
output sitePrincipalId string = site.identity.principalId
