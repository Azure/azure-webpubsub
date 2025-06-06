const express = require("express");
const fileUpload = require("express-fileupload");
const { WebPubSubServiceClient } = require("@azure/web-pubsub");
const { WebPubSubEventHandler } = require("@azure/web-pubsub-express");
const env = require("dotenv");
env.config();

const app = express();

let diagram = {
  shapes: {},
  background: null,
  users: 0,
};

const hubName = "sample_draw";
let serviceClient = new WebPubSubServiceClient(process.argv[2] || process.env.Web_PubSub_ConnectionString, hubName);
let handler = new WebPubSubEventHandler(hubName, {
  path: "/eventhandler",
  handleConnect: async (req, res) => {
    res.success({
      groups: ["draw"],
    });
  },
  onConnected: async (req) => {
    await serviceClient.group("draw").sendToAll({
      name: "updateUser",
      data: ++diagram.users,
    });
  },
  onDisconnected: async (req) => {
    if (--diagram.users < 0) diagram.users = 0;
    await serviceClient.group("draw").sendToAll({
      name: "updateUser",
      data: diagram.users,
    });
  },
  handleUserEvent: async (req, res) => {
    let message = req.data;
    switch (message.name) {
      case "addShape": {
        let [id, shape] = message.data;
        diagram.shapes[id] = shape;
        break;
      }
      case "removeShape": {
        let id = message.data;
        delete diagram.shapes[id];
        break;
      }
      case "clear": {
        diagram.shapes = {};
        diagram.background = null;
        break;
      }
    }
    res.success();
  },
});

app.use(fileUpload());
app.use(handler.getMiddleware());
app
  .get("/negotiate", async (req, res) => {
    let token = await serviceClient.getClientAccessToken({
      roles: ["webpubsub.sendToGroup.draw"],
    });
    res.json({
      url: token.url,
    });
  })
  .get("/diagram", async (req, res) => {
    res.json({
      shapes: diagram.shapes,
      background: diagram.background && diagram.background.id,
    });
  })
  .post("/background/upload", async (req, res) => {
    const file = req.files["file"];
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/gif"];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return res.status(400).send("Invalid file type.");
    }
    // Validate file content (e.g., check for valid image headers)
    const isValidImage = (data) => {
      // Simple check for JPEG, PNG, GIF headers
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff]);
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const gifHeader = Buffer.from([0x47, 0x49, 0x46, 0x38]);
      return data.slice(0, 3).equals(jpegHeader) || data.slice(0, 4).equals(pngHeader) || data.slice(0, 3).equals(gifHeader);
    };
    if (!isValidImage(file.data)) {
      return res.status(400).send("Invalid file content.");
    }
    diagram.background = {
      id: Math.random().toString(36).substr(2, 8),
      data: file.data,
      contentType: file.mimetype,
    };
    await serviceClient.sendToAll({
      name: "updateBackground",
      data: diagram.background.id,
    });
    res.end();
  })
  .get("/background/:id", (req, res) => {
    if (diagram.background && diagram.background.id === req.params.id) {
      res.setHeader("Content-Disposition", 'attachment; filename="background"');
      res.setHeader("Content-Type", diagram.background.contentType);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(diagram.background.data);
    } else res.status(404).end();
  });

app.use(express.static("dist"));
app.listen(8080, () => console.log("Whiteboard server started http://localhost:8080"));
