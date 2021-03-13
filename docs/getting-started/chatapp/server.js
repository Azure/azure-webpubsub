const express = require('express');
const { WebPubSubServer } = require('azure-websockets/webpubsub');

const server = new WebPubSubServer('<CONNECTION_STRING>', 'chat');
const app = express();

let serviceClient = server.createServiceClient();
let handler = server.createCloudEventsHandler({
  path: '/eventhandler',
  onConnected: async req => {
    console.log(`${req.context.userId} connected`);
    await serviceClient.sendToAll(`[SYSTEM] ${req.context.userId} joined`);
  },
  onUserEvent: async req => {
    if (req.eventName === 'message') await serviceClient.sendToAll(`[${req.context.userId}] ${req.payload.data}`);
  }
});

app.use(handler.getMiddleware());
app.get('/negotiate', (req, res) => {
  let id = req.query.id;
  if (!id) {
    res.status(400).send('missing user id');
    return;
  }
  let { url, token } = server.endpoint.clientNegotiate('chat', { userId: id });
  res.send({
    url: `${url}?access_token=${token}`
  });
});

app.use(express.static('public'));
app.listen(8080, () => console.log('server started'));
