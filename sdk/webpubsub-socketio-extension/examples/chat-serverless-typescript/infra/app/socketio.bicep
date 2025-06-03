param name string
param location string = resourceGroup().location
param skuName string = 'Premium_P1'
param identityId string
param disableLocalAuth bool = true

resource socketio 'Microsoft.SignalRService/webPubSub@2024-03-01' = {
  name: name
  location: location
  sku: {
    name: skuName
  }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { 
      '${identityId}': {}
    }
  }
  kind: 'SocketIO'
  properties: {
    disableLocalAuth: disableLocalAuth
    socketIO: {
      serviceMode: 'Serverless'
    }
  }
}

output name string = socketio.name
output uri string = socketio.properties.hostName
