// parameters in resource group
param location string = resourceGroup().location // Location for all resources
param uniqueStr string = uniqueString(resourceGroup().id) // Generate unique string

// parameters for azure web pubsub
param unit int = 1
param demoName string = 'scoreboard'

// parameters for azure app service
param sku string = 'B1' // The SKU of App Service Plan
param linuxFxVersion string = 'node|14-lts' // The runtime stack of web app

var webpubsubName = toLower('wps-${uniqueStr}')
var appServicePlanName = toLower('asp-${uniqueStr}')
var webSiteName = toLower('wap-${uniqueStr}')

module appServiceModule './modules/appService/create.bicep' = {
  name: 'appServiceCreate'
  params: {
    appServicePlanName: appServicePlanName
    webSiteName: webSiteName
    sku: sku
    linuxFxVersion: linuxFxVersion
    location: location
  }
}

module webpubsubModule './modules/webpsubsub/createOrUpdate.bicep' = {
  name: 'webpubsubCreate'
  params: {
    name: webpubsubName
    location: location
    unit: unit
  }
}

module webpusubHubModule './modules/webpsubsub/hub/createOrUpdate.bicep' = {
  name: 'webpubsubHubCreate'
  params: {
    resourceName: webpubsubModule.outputs.name
    hubNameSuffix: demoName
    eventHandlers: [
      {
        auth: {
          managedIdentity: {}
          type: 'None'
        }
        systemEvents: [
          'connect'
          'connected'
          'disconnected'
        ]
        urlTemplate: 'https://${appServiceModule.outputs.host}/eventhandler'
        userEventPattern: '*'
      }
    ]
    anonymousConnectPolicy: 'deny'
  }
}

module appSettings './modules/appService/appSettings/update.bicep' = {
  name: 'AppSettingsUpdate'
  params: {
    resourceName: appServiceModule.outputs.name
    webPubSubConnectionString: webpubsubModule.outputs.conenctionString
  }
}




