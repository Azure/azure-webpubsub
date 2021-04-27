const express = require('express');
const fileUpload = require('express-fileupload');
const { WebPubSubServiceClient } = require('@azure/web-pubsub');
const { WebPubSubEventHandler } = require('@azure/web-pubsub-express');

const app = express();

let diagram = {
  shapes: {},
  background: null,
  users: 0
};

const hubName = 'draw';
let serviceClient = new WebPubSubServiceClient(process.argv[2] || process.env.Web_PubSub_ConnectionString, hubName);
let handler = new WebPubSubEventHandler(hubName, ['*'], {
  path: '/eventhandler',
  onConnected: async req => {
    let res = [];
    for (let i in diagram.shapes)
      await serviceClient.sendToConnection(req.context.connectionId, {
        name: 'shapeUpdated',
        data: [null, i, diagram.shapes[i]]
      });
    if (diagram.background)
      await serviceClient.sendToConnection(req.context.connectionId, {
        name: 'backgroundUpdated',
        data: diagram.background.id
      });
    await serviceClient.sendToAll({
      name: 'userUpdated',
      data: ++diagram.users
    });
  },
  onDisconnected: async req => {
    if (--diagram.users < 0) diagram.users = 0;
    await serviceClient.sendToAll({
      name: 'userUpdated',
      data: diagram.users
    });
  },
  handleUserEvent: async (req, res) => {
    let message = JSON.parse(req.data);
    switch (message.name) {
      case 'patchShape': {
        let [author, id, data] = message.data;
        diagram.shapes[id].data = diagram.shapes[id].data.concat(data);
        await serviceClient.sendToAll({
          name: 'shapePatched',
          data: [author, id, data]
        });
        break;
      }
      case 'updateShape': {
        let [author, id, shape] = message.data;
        diagram.shapes[id] = shape;
        await serviceClient.sendToAll({
          name: 'shapeUpdated',
          data: [author, id, shape]
        });
        break;
      }
      case 'removeShape': {
        let [author, id] = message.data;
        delete diagram.shapes[id];
        await serviceClient.sendToAll({
          name: 'shapeRemoved',
          data: [author, id]
        });
        break;
      }
      case 'clear': {
        let author = message.data;
        diagram.shapes = {};
        diagram.background = null;
        await serviceClient.sendToAll({
          name: 'clear',
          data: author
        });
        break;
      }
      case 'sendMessage': {
        let [author, name, data] = message.data;
        await serviceClient.sendToAll({
          name: "newMessage",
          data: [author, name, data]
        });
        break;
      }
    }
    res.success();
  }
});

app.use(fileUpload());
app.use(handler.getMiddleware());
app
  .get('/negotiate', async (req, res) => {
    let token = await serviceClient.getAuthenticationToken();
    res.json({
      url: token.url
    });
  })
  .post('/background/upload', async (req, res) => {
    diagram.background = {
      id: Math.random().toString(36).substr(2, 8),
      data: req.files['file'].data,
      contentType: req.files['file'].mimetype
    };
    await serviceClient.sendToAll({
      name: 'backgroundUpdated',
      data: diagram.background.id
    });
    res.end();
  })
  .get('/background/:id', (req, res) => {
    if (diagram.background && diagram.background.id === req.params.id) {
      res.type(diagram.background.contentType);
      res.send(diagram.background.data);
    } else res.status(404).end();
  });

app.use(express.static('dist'));
app.listen(8080, () => console.log('app started'));
