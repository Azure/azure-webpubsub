param webPubSubConnectionString string
param resourceName string

resource appSettings 'Microsoft.Web/sites/config@2021-03-01' = {
  name: '${resourceName}/web'
  properties: {
    appSettings: [
      {
        WebPubSubConnectionString: webPubSubConnectionString
      }
    ]
  }
}
