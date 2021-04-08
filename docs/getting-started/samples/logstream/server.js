const express = require('express');
const { WebPubSubServiceClient } = require('@azure/webpubsub');

let endpoint = new WebPubSubServiceClient(process.argv[2], 'stream');
const app = express();

app.get('/negotiate', async (req, res) => {
  let token = await endpoint.getAuthenticationToken({
    claims: {
      role: ['webpubsub.sendToGroup', 'webpubsub.joinLeaveGroup']
    }
  });
  res.send({
    url: token.url
  });
});

app.use(express.static('public'));
app.listen(8080, () => console.log('server started'));
