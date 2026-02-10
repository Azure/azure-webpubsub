// Azure App Service Bicep template for Teams-Lite Demo
// This template creates an App Service Plan and Web App

@description('The name of the web app')
param appName string

@description('The location for the resources')
param location string

@description('The SKU for the App Service Plan')
param sku string = 'B1'

var appServicePlanName = '${appName}-plan'

resource appServicePlan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: appServicePlanName
  location: location
  kind: 'linux'
  sku: {
    name: sku
  }
  properties: {
    reserved: true // Required for Linux
  }
}

resource webApp 'Microsoft.Web/sites@2022-09-01' = {
  name: appName
  location: location
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appCommandLine: 'node server.mjs'
      alwaysOn: true
      appSettings: [
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~22'
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'false'
        }
      ]
    }
    httpsOnly: true
  }
}

resource webAppLogging 'Microsoft.Web/sites/config@2022-09-01' = {
  parent: webApp
  name: 'logs'
  properties: {
    applicationLogs: {
      fileSystem: {
        level: 'Information'
      }
    }
    httpLogs: {
      fileSystem: {
        enabled: true
        retentionInDays: 7
        retentionInMb: 35
      }
    }
  }
}

output appUrl string = 'https://${webApp.properties.defaultHostName}'
output appName string = webApp.name
