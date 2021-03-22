const express = require('express');
const { WebPubSubServiceClient, WebPubSubCloudEventsHandler, PayloadDataType } = require('@azure/webpubsub')

const hub = 'chat';
const serviceClient = new WebPubSubServiceClient('<CONNECTION_STRING>', hub);
const app = express();

const handler = new WebPubSubCloudEventsHandler(hub, ['*'], {
  onConnect: async req => {
    return {};
  },
  onConnected: async req => {
    console.log(`${req.context.userId} connected`);
    await serviceClient.sendToAll(`[SYSTEM] ${req.context.userId} joined`, { plainText: true });
  },
  onUserEvent: async req => {
    if (req.context.eventName === 'message') {
      await serviceClient.sendToAll(`[${req.context.userId}] ${req.payload.data}`, { plainText: true });
    }
    return {
      payload: {
        data: "received",
        dataType: PayloadDataType.text
      }
    }
  }
});

app.use(handler.getMiddleware());
app.get('/negotiate', async (req, res) => {
  let id = req.query.id;
  if (!id) {
    res.status(400).send('missing user id');
    return;
  }

  const { url } = await serviceClient.getAuthenticationToken({ userId: id });
  res.send({
    url: url
  });
});

app.use(express.static('public'));
app.listen(8080, () => console.log('server started:' + handler.path));
