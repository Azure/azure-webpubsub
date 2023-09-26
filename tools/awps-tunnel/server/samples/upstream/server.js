const express = require("express");

const { WebPubSubEventHandler } = require("@azure/web-pubsub-express");
const handler = new WebPubSubEventHandler("chat", {
  path: "/eventhandler",
  onConnected: (req) => {
    console.log(JSON.stringify(req));
  },
  onDisconnected: (req) => {
    console.log(JSON.stringify(req));
  },
  handleUserEvent: (req, res) => {
    console.log(JSON.stringify(req));
    res.success("Hey " + req.data, req.dataType);
  },
});

const app = express();

app.use(handler.getMiddleware());

app.listen(3000, () => console.log(`Azure WebPubSub Upstream ready at http://localhost:3000${handler.path}`));
