const { WebPubSubServiceClient } = require('@azure/web-pubsub');

if (process.argv.length !== 5) {
  console.log('Usage: node publish <connection-string> <hub-name> <message>');
  return 1;
}

let serviceClient = new WebPubSubServiceClient(process.argv[2], process.argv[3]);
// by default it uses `application/json`, specify contentType as `text/plain` if you want plain-text
serviceClient.sendToAll(process.argv[4], { contentType: 'text/plain' });
