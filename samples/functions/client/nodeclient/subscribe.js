const WebSocket = require('ws');
const { WebPubSubServiceClient } = require('@azure/web-pubsub');

async function main() {
  if (process.argv.length !== 3) {
    console.log('Usage: node subscribe <connection-string>');
    return 1;
  }

  let serviceClient = new WebPubSubServiceClient(process.argv[2], "notification");
  let token = await serviceClient.getAuthenticationToken();
  console.log(token.url);
  let ws = new WebSocket(token.url);
  ws.on('open', () => console.log('connected'));
  ws.on('message', data => console.log(data));;
}

main();