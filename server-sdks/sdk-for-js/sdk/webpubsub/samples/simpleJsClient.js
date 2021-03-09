const WebSocket = require('ws');
const {WebPubSubServiceEndpoint} = require('./../dist/webpubsub');
 
async function main() {

   var se = new WebPubSubServiceEndpoint("Endpoint=http://localhost;AccessKey=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGH;Port=8080;Version=1.0;");
   var clientResponse = se.clientNegotiate('chat', {
     userId: "vicancy",
     roles: ["webpubsub.group.join"],
     claims: {
       "hey": ["w"]
     }
   });
  console.log(clientResponse);
  
  let clients = [
    new WebSocket(clientResponse.url + "?access_token=" + clientResponse.token)
    // new WebSocket("ws://localhost:8080/client/hubs/chat")
  ];

  clients.map(client => {
    client.on('message', msg => console.log(msg));
  });

  // // Wait for the client to connect using async/await
  // await new Promise(resolve => clients[0].once('open', resolve));

  // // Prints "Hello!" twice, once for each client.
  // // clients[0].send('Hello!');
}

main();