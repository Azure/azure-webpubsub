const express = require('express');
const { WebPubSubServiceClient } = require('@azure/web-pubsub');
const { WebPubSubCloudEventsHandler } = require('@azure/web-pubsub-express');

const app = express();
const hubName = 'chat';

let serviceClient = new WebPubSubServiceClient(process.argv[2], hubName);
let handler = new WebPubSubCloudEventsHandler(hubName, ['*'], {
  path: '/eventhandler',
  onConnected: async req => {
    console.log(`${req.context.userId} connected`);
    await serviceClient.sendToAll(`[SYSTEM] ${req.context.userId} joined`, { contentType: "text/plain" });
  },
  handleUserEvent: async (req, res) => {
    if (req.context.eventName === 'message') {
      await serviceClient.sendToAll(`[${req.context.userId}] ${req.data}`, { contentType: "text/plain" });
    }
    res.success();
  }
});

app.use(handler.getMiddleware());
app.get('/negotiate', async (req, res) => {
  let id = req.query.id;
  if (!id) {
    res.status(400).send('missing user id');
    return;
  }
  let token = await serviceClient.getAuthenticationToken({ userId: id });
  res.json({
    url: token.url
  });
});

app.use(express.static('public'));
app.listen(8080, () => console.log('server started'));
