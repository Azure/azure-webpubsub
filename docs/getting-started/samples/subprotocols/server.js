const express = require('express');
const { WebPubSubServer } = require('azure-websockets/webpubsub');

const server = new WebPubSubServer('Endpoint=https://kenchenwps1.webpubsubdev.azure.com;AccessKey=zxVWyVsxh/V+B7jkpIdcccxwaznxkHKyH1Zl1uV0UaA=;Version=1.0;', 'chat');
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
app.options('/eventhandler', (req, res) => {
  console.log(req);
  res.send();
});
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
