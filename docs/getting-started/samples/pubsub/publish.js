const { WebPubSubServiceClient } = require('@azure/webpubsub');

if (process.argv.length !== 5) {
  console.log('Usage: node publish <connection-string> <hub-name> <message>');
  return 1;
}

let serviceClient = new WebPubSubServiceClient(process.argv[2], process.argv[3]);
serviceClient.sendToAll(process.argv[4], { dataType: 'text' });
