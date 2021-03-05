const WebSocket = require('ws');

async function main() {

  let clients = [
    new WebSocket('ws://localhost:8080/client/hubs/chat', 'json.webpubsub.azure.v1')
  ];

  clients.map(client => {
    client.on('message', msg => console.log(msg));
  });

  // Wait for the client to connect using async/await
  await new Promise(resolve => clients[0].once('open', resolve));

  // Prints "Hello!" twice, once for each client.
   //clients[0].send('Hello!');
  clients[0].send(JSON.stringify({
    data: "hello",
    type: "event",
    event: "hey"
  }));
  clients[0].send(JSON.stringify({
    type: "join",
    group: "group1",
  }));
  clients[0].send(JSON.stringify({
    type: "publish",
    group: "group1",
    data: {
      "msg1": "Hello world"
    },
  }));
}

main();