param resourceName string

resource symbolicname 'Microsoft.Web/sites/extensions@2021-03-01' = {
  name: '${resourceName}/MSDeploy'
  properties: {
    packageUri: 'todo'
  }
}
