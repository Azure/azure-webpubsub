// parameters for azure web pubsub
@metadata({
  description: 'Unit of Azure Web PubSub service. The default value is 1.'
})
@allowed([
  'Free'
  'Standard Unit 1'
  'Standard Unit 2'
  'Standard Unit 5'
  'Standard Unit 10'
  'Standard Unit 20'
  'Standard Unit 50'
  'Standard Unit 100'
])
param WebPubSubSku string = 'Free'

// parameters for azure app service
@metadata({
  description: 'The SKU of Azure App service. The default value is B1.'
})
@allowed([
  'F1'
  'B1'
  'B2'
  'B3'
  'D1'
  'S1'
  'S2'
  'S3'
  'P1v2'
  'P2v2'
  'P3v2'
  'P1v3'
  'P2v3'
  'P3v3'
  'I1'
  'I2'
  'I3'
  'I1v2'
  'I2v2'
  'I3v2'
])
param appServiceSku string = 'F1' // The SKU of App Service Plan

@metadata({
  description: 'Demo package to be deployed.'
})
param packageUri string = 'https://livedemopackages.z13.web.core.windows.net/packages/scoreboard_0.1.0.zip'

var location = resourceGroup().location
var demoName = 'scoreboard'
var uniqueStr = uniqueString(resourceGroup().id) // Generate unique string
var webpubsubName = toLower('wps-${demoName}-${uniqueStr}')
var appServicePlanName = toLower('asp-${demoName}-${uniqueStr}')
var webSiteName = toLower('wap-${demoName}-${uniqueStr}')

module appServiceModule './modules/appService/create.bicep' = {
  name: 'appServiceCreate'
  params: {
    appServicePlanName: appServicePlanName
    webSiteName: webSiteName
    sku: appServiceSku
    packageUri: packageUri
    location: location
  }
}

var tier = WebPubSubSku == 'Free' ? 'Free' : 'Standard'
var ind = tier == 'Free' ? -1 : lastIndexOf(WebPubSubSku, ' ')
var str = ind == -1 ? '1' : substring(WebPubSubSku, ind + 1, length(WebPubSubSku) - ind - 1)
var webPubSubUnit = int(str)

module webpubsubModule './modules/webpsubsub/createOrUpdate.bicep' = {
  name: 'webpubsubCreate'
  params: {
    location: location
    name: webpubsubName
    unit: webPubSubUnit
    tier: tier
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
    webSiteName: appServiceModule.outputs.webSiteName
    webPubSubConnectionString: webpubsubModule.outputs.conenctionString
  }
}

module deployPackage './modules/appService/package/deploy.bicep' = {
  name: 'deployPackage'
  params: {
    packageUri: packageUri
    webSiteName: appServiceModule.outputs.webSiteName
  }
}

output demoLink string = appServiceModule.outputs.host
