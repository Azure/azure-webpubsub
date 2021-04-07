const { WebPubSubServiceClient } = require('@azure/web-pubsub');

if (process.argv.length !== 5) {
  console.log('Usage: node publish <connection-string> <hub-name> <message>');
  return 1;
}

let serviceClient = new WebPubSubServiceClient(process.argv[2], process.argv[3]);
// will send with plain/text
serviceClient.sendToAll(process.argv[4], {contentType: "text/plain"});

// will send with application/json
// serviceClient.sendToAll({"hello": "world"});
