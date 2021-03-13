const { WebPubSubServiceRestClient } = require('azure-websockets/webpubsub');

let serviceClient = new WebPubSubServiceRestClient('<CONNECTION_STRING>', 'my_hub');
serviceClient.sendToAll('Hello World');
