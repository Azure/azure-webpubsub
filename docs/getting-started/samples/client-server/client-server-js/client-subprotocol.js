const WebSocket = require('ws');
const { WebPubSubServiceClient } = require('@azure/web-pubsub');

async function main() {
  if (process.argv.length !== 4) {
    console.log('Usage: node client-subprotocol <connection-string> <hub-name>');
    return 1;
  }

  let serviceClient = new WebPubSubServiceClient(process.argv[2], process.argv[3]);
  let token = await serviceClient.getAuthenticationToken({
    userId: "user1",
    roles: [
      "webpubsub.joinLeaveGroup"
    ]
  });
  console.log(token);
  let ws = new WebSocket(token.url, 'json.webpubsub.azure.v1');
  ws.on('open', () => {
    ws.send(JSON.stringify({
      type: "joinGroup",
      ackId: 1,
      group: "group1"
    }));
  }
  );
  ws.on('message', data => console.log(data));;
}

main();