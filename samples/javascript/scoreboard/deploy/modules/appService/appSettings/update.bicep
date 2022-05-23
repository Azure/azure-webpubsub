param webPubSubConnectionString string
param webSiteName string

resource appSettings 'Microsoft.Web/sites/config@2021-03-01' = {
  name: '${webSiteName}/web'
  properties: {
    appSettings: [
      {
        name: 'WebPubSubConnectionString'
        value: webPubSubConnectionString
      }
    ]
  }
}
