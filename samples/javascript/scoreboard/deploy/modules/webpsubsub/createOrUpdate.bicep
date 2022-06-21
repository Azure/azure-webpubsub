param name string

param location string

@allowed([
  1
  2
  5
  10
  20
  50
  100
])
param unit int

@allowed([
  'Free'
  'Standard'
])
param tier string

var skuName = tier == 'Free' ? 'Free_F1' : 'Standard_S1'

resource webpubsub 'Microsoft.SignalRService/webPubSub@2021-10-01' = {
  name: name
  location: location
  sku: {
    name: skuName
    tier: tier
    capacity: unit
  }
  properties: {
    tls: {
        clientCertEnabled: false
    }
    networkACLs: {
        defaultAction: 'Deny'
        publicNetwork: {
            allow: [
                'ServerConnection'
                'ClientConnection'
                'RESTAPI'
                'Trace'
            ]
        }
        privateEndpoints: []
    }
    publicNetworkAccess: 'Enabled'
    disableLocalAuth: false
    disableAadAuth: false
  }
}

output name string = webpubsub.name
output hostname string = webpubsub.properties.hostName
output conenctionString string = webpubsub.listKeys().primaryConnectionString
