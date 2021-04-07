const { WebPubSubCloudEventsHandler, WebPubSubServiceClient } = require('@azure/webpubsub');

const express = require('express');

let connStr = process.argv[2];

let client = new WebPubSubServiceClient(connStr, 'chat');

const handler = new WebPubSubCloudEventsHandler(
    'chat', ["*"], {
        dumpRequest: false,
        handleConnect: async(req, res) => {
            let connId = req.context.connectionId;
            let userId = "user" + Math.floor(Math.random() * 128)
            console.log(userId + " connect")

            res.success({
                userId: userId,
                groups: ["default"],
                roles: [
                    "webpubsub.sendToGroup.default"
                ]
            });

            client.sendToConnection(connId, JSON.stringify({
                connectionId: connId,
                userId: userId,
            }))
        },
        onDisconnected: async req => {
            console.log("disconnected")
        }
    }
);

const app = express();
app.use(express.static('public'));
app.use(handler.getMiddleware())
app.use(express.json())

app.get('/negotiate', async(req, res) => {
    let token = await client.getAuthenticationToken();
    console.log("negotiate")
    res.send({
        url: token.url
    });
});

app.put('/permission', async(req, res) => {
    let data = req.body
    console.log("start grant")
    let r = await client.grantPermission(data.connectionId, data.action, data.group);
    console.log(r)
    res.send({ success: r })
});

app.delete('/permission', async(req, res) => {
    let data = req.body
    console.log("start revoke")
    let r = await client.revokePermission(data.connectionId, data.action, data.group);
    console.log(r)
    res.send({ success: r })
});

app.listen(5050, () => console.log('server started'));