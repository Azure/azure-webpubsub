const WebSocket = require('ws');
const client = new WebSocket("{Client_URL}");
client.on('open', () => {
    client.on('message', msg => console.log(msg));
});