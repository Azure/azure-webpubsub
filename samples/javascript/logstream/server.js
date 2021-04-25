const express = require('express');
const { WebPubSubServiceClient } = require('@azure/web-pubsub');

let endpoint = new WebPubSubServiceClient(process.argv[2], 'stream');
const app = express();

app.get('/negotiate', async (req, res) => {
  let token = await endpoint.getAuthenticationToken({
    claims: {
      role: ['webpubsub.sendToGroup.stream', 'webpubsub.joinLeaveGroup.stream']
    }
  });
  res.json({
    url: token.url
  });
});

app.use(express.static('public'));
app.listen(8080, () => console.log('server started'));
