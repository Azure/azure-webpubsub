// Infrastructure for Chat Demo: App Service + Azure Web PubSub
// Deploys:
// - Server farm (App Service Plan)
// - Linux Web App for Python (expects container or code deployment)
// - Azure Web PubSub service with a hub and event handler pointing at the web app
// Outputs helpful connection info.

@description('Base name/prefix for all resources')
param baseName string = 'chatdemo'

@description('Location for all resources')
param location string = resourceGroup().location

@description('SKU for the App Service Plan')
@allowed(['B1','B2','B3','S1','S2','S3','P1v3'])
param appServiceSku string = 'B1'

@description('Web PubSub SKU')
@allowed(['Free_F1','Standard_S1'])
param webPubSubSku string = 'Free_F1'

@description('Web PubSub Capacity (1 for Free)')
param webPubSubCapacity int = 1

@description('Name of the Web PubSub hub to use')
param hubName string = 'chat'

@description('Storage account SKU')
param storageSku string = 'Standard_LRS'
@description('Blob container name for chat persistence')
param storageContainer string = 'chatdemo'
@description('Blob name for chat persistence')
param storageBlobName string = 'state.json'

// Resource name derivations
var planName = '${baseName}-plan'
var webAppName = toLower('${baseName}-app')
var wpsName = toLower('${baseName}-wps')
var storageName = toLower(replace('${baseName}store','-',''))
// Secure values via key listing (kept internal; avoid outputting secrets)
// Keys (listKeys still required for connection strings)
var webPubSubConnString = listKeys(resourceId('Microsoft.SignalRService/webPubSub', wpsName), '2024-03-01').primaryConnectionString
var storageConnString = listKeys(resourceId('Microsoft.Storage/storageAccounts', storageName), '2023-01-01').keys[0].value

// App Service Plan (Linux)
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  sku: {
    name: appServiceSku
    tier: startsWith(appServiceSku, 'B') ? 'Basic' : (startsWith(appServiceSku,'S') ? 'Standard' : 'PremiumV3')
    size: appServiceSku
    capacity: 1
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

// Web App (Python). Deployment (code/container) done separately.
resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: webAppName
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'PYTHON|3.12'
      appSettings: [
        // Transport mode: service (webpubsub) so server selects Web PubSub
        {
          name: 'AZURE'
          value: 'true'
        }
        {
          name: 'WEBPUBSUB_HUB'
          value: hubName
        }
        // Connection string inserted after Web PubSub provisioning via listKeys()
          {
            name: 'WEBPUBSUB_CONNECTION_STRING'
            value: webPubSubConnString
          }
        // Azure storage connection (persistence)
        {
          name: 'AZURE_STORAGE_CONNECTION_STRING'
            value: storageConnString
        }
        {
          name: 'CHAT_STORAGE_CONTAINER'
          value: storageContainer
        }
        {
          name: 'CHAT_STORAGE_BLOB'
          value: storageBlobName
        }
        // Allow negotiate from browser origins (adjust as needed)
        {
          name: 'ALLOWED_ORIGINS'
          value: '*'
        }
      ]
    }
  }
}

// Storage account for room history persistence
resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageName
  location: location
  sku: {
    name: storageSku
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
  }
}

// Blob container
resource storageContainerRes 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  name: '${storage.name}/default/${storageContainer}'
  properties: {
    publicAccess: 'None'
  }
}

// Azure Web PubSub
resource wps 'Microsoft.SignalRService/webPubSub@2024-03-01' = {
  name: wpsName
  location: location
  sku: {
    name: webPubSubSku
    tier: split(webPubSubSku, '_')[0] // Free or Standard
    capacity: webPubSubCapacity
  }
  properties: {
    tls: {
      clientCertEnabled: false
    }
  }
}

// Hub definition with event handler. Event handler URL will point to the web app negotiate endpoint.
// The server code exposes /negotiate for client connections.
resource hub 'Microsoft.SignalRService/webPubSub/hubs@2024-03-01' = {
  name: hubName
  parent: wps
  properties: {
    eventHandlers: [
      {
        // For chat scenario we allow all events and user events.
        urlTemplate: 'https://${webApp.name}.azurewebsites.net/api/{event}'
        userEventPattern: '*'
        systemEvents: [ 'connect', 'connected', 'disconnected' ]
        auth: {
          // No auth header injection; rely on your web app logic
          managedIdentity: {
            resource: ''
          }
        }
      }
    ]
  }
}

// Output values
output webAppUrl string = 'https://${webApp.name}.azurewebsites.net'
output negotiateEndpoint string = 'https://${webApp.name}.azurewebsites.net/negotiate'
output webPubSubHost string = wps.properties.hostName
// Secret connection string intentionally not output.
output hub string = hubName
output storageAccountName string = storage.name
output storageContainerName string = storageContainer
output storageBlobName string = storageBlobName
