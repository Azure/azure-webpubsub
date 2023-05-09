const express = require('express');
const fileUpload = require('express-fileupload');
const { WebPubSubServiceClient } = require('@azure/web-pubsub');

const app = express();

const hubName = 'sample_video';
let connectionString = process.argv[2] || process.env.WebPubSubConnectionString;
let serviceClient = new WebPubSubServiceClient(connectionString, hubName);

app.use(fileUpload());
app
  .get('/negotiate', async (req, res) => {
    let token = await serviceClient.getClientAccessToken({
      roles: ['webpubsub.sendToGroup', 'webpubsub.joinLeaveGroup']
    });
    res.json({
      url: token.url
    });
  });

app.use(express.static('dist'));
app.listen(8080, () => console.log('app started'));