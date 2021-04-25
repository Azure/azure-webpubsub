const express = require('express');
const { WebPubSubServiceClient } = require('@azure/web-pubsub');

const app = express();
let endpoint = new WebPubSubServiceClient(process.argv[2], 'clientchat');

app.get('/negotiate', async (req, res) => {
    let id = req.query.id;
    let role = [`webpubsub.sendToGroup.public`, `webpubsub.joinLeaveGroup.public`];
    let token = await endpoint.getAuthenticationToken({ userId: id, claims: { role: role } });
    res.json({
      url: token.url
    });
  });

app.use(express.static('public'));
app.listen(8080, () => console.log('app started'));
