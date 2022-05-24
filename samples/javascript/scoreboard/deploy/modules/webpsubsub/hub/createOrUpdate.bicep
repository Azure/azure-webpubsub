param resourceName string
param hubNameSuffix string
param eventHandlers array
param anonymousConnectPolicy string

var hubName = 'sample_${hubNameSuffix}'

resource hub 'Microsoft.SignalRService/webPubSub/hubs@2021-10-01' = {
  name: '${resourceName}/${hubName}'
  properties: {
    anonymousConnectPolicy: anonymousConnectPolicy
    eventHandlers: eventHandlers
  }
}
