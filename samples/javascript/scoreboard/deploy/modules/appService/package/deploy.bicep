param webSiteName string
param packageUri string

resource deployPackage 'Microsoft.Web/sites/extensions@2018-02-01' = {
  name: '${webSiteName}/MSDeploy'
  properties: {
    packageUri: packageUri
  }
}
