const express = require("express");
const { WebPubSubServiceClient } = require("@azure/web-pubsub");

const app = express();
const hubName = "hubtest1";
const port = 8080;

let serviceClient = new WebPubSubServiceClient(process.env.WebPubSubConnectionString, hubName);

app.get("/negotiate", async (req, res) => {
  // this is a super simple demo for how to do auth, normally you go through an auth flow
  let id = req.query.id;
  if (!id) {
    res.status(400).send("missing user id");
    return;
  }
  let token = await serviceClient.getClientAccessToken({ userId: id });
  res.json({
    url: token.url,
  });
});

app.use(express.static("build"));
app.listen(port, () => console.log("server started at localhost:" + port));
