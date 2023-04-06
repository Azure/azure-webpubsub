const express = require('express');
const { WebPubSubServiceClient } = require('@azure/web-pubsub');
const { WebPubSubEventHandler } = require('@azure/web-pubsub-express');
const invokeChatgpt = require('./chatgpt');

const hubname = "groupchatgpt";
// https://demo4chatgpt.openai.azure.com/
// eastus
const connectionString = process.argv[2] || process.env.WebPubSubConnectionString;
const service = new WebPubSubServiceClient(connectionString, hubname);

const port = 8080;
const app = express();

app.use(express.static("build"));
app.get('/negotiate', async (req, res) => {
    const token = await service.getClientAccessToken({roles: [
        "webpubsub.sendToGroup.chat",
        "webpubsub.joinLeaveGroup.chat"
    ]});
    res.status(200).send(token.url);
})

let handler = new WebPubSubEventHandler(hubname, {
  path: '/eventhandler',
  handleUserEvent: async (req, res) => {
    console.log(req);
    if (req.context.eventName === "invokegpt"){
        const response = invokeChatgpt(req.data.message);
        res.success({message: response, from: "@gpt"});
    }else {
        res.fail(401, "Invalid invoke.");
    }
  }
});

app.use(handler.getMiddleware());
app.listen(port, ()=>console.log(`Open http://localhost:${port}`));

