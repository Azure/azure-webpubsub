param appServicePlanName string
param webSiteName string
param sku string
param packageUri string
param location string

resource appServicePlan 'Microsoft.Web/serverfarms@2020-06-01' = {
  name: appServicePlanName
  location: location
  sku: {
    name: sku
  }
}

resource appService 'Microsoft.Web/sites@2020-06-01' = {
  name: webSiteName
  location: location
  properties: {
    serverFarmId: appServicePlan.id
  }
}

resource deployPackage 'Microsoft.Web/sites/extensions@2018-02-01' = {
  name: 'MSDeploy'
  parent: appService
  properties: {
    packageUri: packageUri
  }
}

output host string = appService.properties.defaultHostName
output webSiteName string = webSiteName
