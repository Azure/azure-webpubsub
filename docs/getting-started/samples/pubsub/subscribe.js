const WebSocket = require('ws');
const { WebPubSubServiceClient } = require('@azure/webpubsub');

let endpoint = new WebPubSubServiceClient('<CONNECTION_STRING>', 'my_hub');
let token = endpoint.getAuthenticationToken();
let ws = new WebSocket(token.url);

ws.on('open', () => console.log('connected'));
ws.on('message', data => console.log(data));;
