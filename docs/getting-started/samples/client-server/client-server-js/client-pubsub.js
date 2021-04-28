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
      "webpubsub.joinLeaveGroup",
      "webpubsub.sendToGroup"
    ]
  });
  const subscriber = new WebSocket(token.url, "json.webpubsub.azure.v1");
  const publisher = new WebSocket(token.url, "json.webpubsub.azure.v1");

  publisher.on('message', msg => {
    console.log(msg);
  });
  const subscriberConnected = new Promise(resolve => subscriber.once('open', resolve));
  const publisherConnected = new Promise(resolve => publisher.once('open', resolve));
  const joined = new Promise(resolve => {
    subscriber.on('message', msg => {
      console.log(msg);
      const obj = JSON.parse(msg);
      if (obj.ackId && obj.success) {
        resolve();
      }
    });
  });

  // make sure both are connected
  await subscriberConnected;
  await publisherConnected;

  subscriber.send(JSON.stringify({
    type: "joinGroup",
    group: "group1",
    ackId: 1, // use ackId to receive ack messages
  }));

  // make sure the subscriber is successfully joined
  await joined;

  // publish to the group to see if the subscriber can receive the message
  publisher.send(JSON.stringify({
    type: "sendToGroup",
    group: "group1",
    data: {
      "msg1": "Hello world"
    }
  }));
}

main();