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
      {
        name: 'NODE_ENV'
        value: 'production'
      }
      {
        name: 'WEBSITE_NODE_DEFAULT_VERSION'
        value: '~16'
      }
    ]
  }
}
