const express = require('express');
const { WebPubSubServiceClient } = require('@azure/web-pubsub');

let endpoint = new WebPubSubServiceClient(process.env.WebPubSubConnectionString, 'awpssamplestream');
const app = express();

app.get('/negotiate', async (req, res) => {
  let token = await endpoint.getClientAccessToken({
    roles: ['webpubsub.sendToGroup.stream', 'webpubsub.joinLeaveGroup.stream']
  });
  res.json({
    url: token.url
  });
});

app.use(express.static('public'));
app.listen(8080, () => console.log('server started'));
