const WebSocket = require('ws');
 
async function main() {
  let clients = [
    new WebSocket("{client_url_from_portal}")
  ];

  clients.map(client => {
    client.on('message', msg => console.log(msg));
  });

  // Wait for the client to connect using async/await
  await new Promise(resolve => clients[0].once('open', resolve));

  // Prints "Hello!" twice, once for each client.
   clients[0].send('Hello!');
}

main();