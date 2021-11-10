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
  handleConnect: async (req, res) => {
    res.success({
      groups: ['draw']
    });
  },
  onConnected: async req => {
    await serviceClient.group('draw').sendToAll({
      name: 'updateUser',
      data: ++diagram.users
    });
  },
  onDisconnected: async req => {
    if (--diagram.users < 0) diagram.users = 0;
    await serviceClient.group('draw').sendToAll({
      name: 'updateUser',
      data: diagram.users
    });
  },
  handleUserEvent: async (req, res) => {
    let message = req.data;
    switch (message.name) {
      case 'addShape': {
        let [id, shape] = message.data;
        diagram.shapes[id] = shape;
        break;
      }
      case 'removeShape': {
        let id = message.data;
        delete diagram.shapes[id];
        break;
      }
      case 'clear': {
        diagram.shapes = {};
        diagram.background = null;
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
    let token = await serviceClient.getClientAccessToken({
      roles: ['webpubsub.sendToGroup.draw']
    });
    res.json({
      url: token.url
    });
  })
  .get('/diagram', async (req, res) => {
    res.json({
      shapes: diagram.shapes,
      background: diagram.background && diagram.background.id
    });
  })
  .post('/background/upload', async (req, res) => {
    diagram.background = {
      id: Math.random().toString(36).substr(2, 8),
      data: req.files['file'].data,
      contentType: req.files['file'].mimetype
    };
    await serviceClient.sendToAll({
      name: 'updateBackground',
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
