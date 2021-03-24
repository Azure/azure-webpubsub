const { WebPubSubServiceClient } = require('@azure/webpubsub');

let serviceClient = new WebPubSubServiceClient('<CONNECTION_STRING>', 'my_hub');
serviceClient.sendToAll('Hello World', { dataType: 'text'});
