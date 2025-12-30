
const express = require('express');
const { WebPubSubServiceClient } = require('@azure/web-pubsub');
const { WebPubSubEventHandler } = require('@azure/web-pubsub-express');

const hubName = 'chat';
const app = express();
const port = process.env.PORT || 3000;

const connectionString = process.env.WebPubSubConnectionString || process.argv[2];

let serviceClient = new WebPubSubServiceClient(connectionString, hubName, {allowInsecureConnection: true});
let handler = new WebPubSubEventHandler(hubName, {
  path: '/eventhandler',
  onConnected: async req => {
    console.log(`${req.context.userId} connected`);
  },
});

app.get('/api/negotiate', async (req, res) => {
  let userId = req.query.userId;
  if (!userId) {
    res.status(400).send('userId is required');
    return;
  }
  let token = await serviceClient.getClientAccessToken({ userId: userId });
  res.json({
    url: token.url
  });
});

app.use(handler.getMiddleware());

app.listen(port, () => console.log(`Event handler listening at http://localhost:${port}${handler.path}`));