const WebSocket = require('ws');
const { WebPubSubServiceClient } = require('@azure/web-pubsub');

async function main() {
  const hub = "pubsub";
  let serviceClient = new WebPubSubServiceClient(process.env.WebPubSubConnectionString, hub);
  let token = await serviceClient.getClientAccessToken();
  let ws = new WebSocket(token.url);
  ws.on('open', () => console.log('connected'));
  ws.on('message', data => console.log('Message received: %s', data));
}

main();