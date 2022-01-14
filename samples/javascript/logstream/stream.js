const WebSocket = require('ws');
const fetch = require('node-fetch');

async function main() {
  let res = await fetch(`http://localhost:8080/negotiate`);
  let data = await res.json();
  let ws = new WebSocket(data.url, 'json.webpubsub.azure.v1');
  let ackId = 0;
  ws.on('open', () => {
    process.stdin.on('data', data => {
      let a = JSON.stringify({
        type: 'sendToGroup',
        group: 'stream',
        dataType: 'text',
        ackId: ++ackId,
        data: data.toString()
      });
      ws.send(a);
    });
  });
  ws.on('message', data => console.log("Received: %s", data));
  process.stdin.on('close', () => ws.close());
}

main();
