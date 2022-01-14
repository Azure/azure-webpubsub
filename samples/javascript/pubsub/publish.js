const { WebPubSubServiceClient } = require('@azure/web-pubsub');

if (process.argv.length !== 3) {
  console.log('Usage: node publish <message>');
  return 1;
}
const hub = "pubsub";
let serviceClient = new WebPubSubServiceClient(process.env.WebPubSubConnectionString, hub);
// by default it uses `application/json`, specify contentType as `text/plain` if you want plain-text
serviceClient.sendToAll(process.argv[2], { contentType: "text/plain" });
