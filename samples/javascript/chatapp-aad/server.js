const express = require('express');
const { WebPubSubServiceClient } = require('@azure/web-pubsub');
const { WebPubSubEventHandler } = require('@azure/web-pubsub-express');
const { DefaultAzureCredential, ClientSecretCredential, VisualStudioCodeCredential, AzureCliCredential, ClientCertificateCredential } = require('@azure/identity')

const app = express();
const hubName = 'chat';

let endpoint = process.argv[2] // sample: https://<name>.webpubsub.azure.com

let credential = new DefaultAzureCredential();

// For Azure application, use:
// let credential = new ClientSecretCredential("<tenantId>", "<clientId>", "<clientSecret>");
// or
// let credential = new ClientCertificateCredential("<tenantId>", "<clientId>", "<pathToCert>");

// For Visual Studio Code user, use:
// let credential = new VisualStudioCodeCredential();

// For command line user, use:
// let credential = new AzureCliCredential();

let serviceClient = new WebPubSubServiceClient(endpoint, credential, hubName);

let handler = new WebPubSubEventHandler(hubName, {
  path: '/eventhandler',
  handleConnect: async (req, res) => {
    console.log(req)
    await serviceClient.sendToAll({
      type: "system",
      message: `${req.context.userId} joined`
    });
    console.log("123")
    res.success();
  },
  handleUserEvent: async (req, res) => {
    if (req.context.eventName === 'message') {
      await serviceClient.sendToAll({
        from: req.context.userId,
        message: req.data
      });
    }
    res.success();
  },
  allowedEndpoints: ['*']
});

app.use(handler.getMiddleware());
app.get('/negotiate', async (req, res) => {
  let id = req.query.id;
  if (!id) {
    res.status(400).send('missing user id');
    return;
  }
  let token = await serviceClient.getClientAccessToken({ userId: id });
  res.json({
    url: token.url
  });
});

app.use(express.static('public'));
app.listen(8080, () => console.log('server started'));
