const WebSocket = require('ws');
const { WebPubSubServiceClient } = require('@azure/web-pubsub');

async function main() {
  if (process.argv.length !== 4) {
    console.log('Usage: node subscribe <connection-string> <hub-name>');
    return 1;
  }

  let serviceClient = new WebPubSubServiceClient(process.argv[2], process.argv[3]);
  let token = await serviceClient.getAuthenticationToken();
  let ws = new WebSocket(token.url);
  ws.on('open', () => console.log('connected'));
  ws.on('message', data => console.log(data));;
}

main();