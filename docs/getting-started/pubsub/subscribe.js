const WebSocket = require('ws');
const { WebPubSubServiceEndpoint } = require('azure-websockets/webpubsub');

let endpoint = new WebPubSubServiceEndpoint('<CONNECTION_STRING>');
let { url, token } = endpoint.clientNegotiate('my_hub');
let ws = new WebSocket(`${url}?access_token=${token}`);

ws.on('open', () => console.log('connected'));
ws.on('message', data => console.log(data));;
