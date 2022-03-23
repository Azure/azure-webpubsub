const express = require('express');
const { WebPubSubServiceClient } = require('@azure/web-pubsub');

const app = express();
let connectionString = process.argv[2] || process.env.WebPubSubConnectionString;
let endpoint = new WebPubSubServiceClient(connectionString, 'awpssamplecodestream');

app.get('/negotiate', async (req, res) => {
    let id = req.query.id || Math.random().toString(36).slice(2, 7);
    let roles = req.query.id
      ? [`webpubsub.sendToGroup.${id}-control`, `webpubsub.joinLeaveGroup.${id}`]
      : [`webpubsub.sendToGroup.${id}`, `webpubsub.joinLeaveGroup.${id}-control`];
    let token = await endpoint.getClientAccessToken({roles: roles });
    res.json({
      id: id,
      url: token.url
    });
  });

app.use(express.static('public'));
app.listen(8080, () => console.log('app started'));