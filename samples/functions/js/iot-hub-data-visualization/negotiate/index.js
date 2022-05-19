const { WebPubSubServiceClient } = require("@azure/web-pubsub");

module.exports = async function (context, req, connection) {
  const serviceClient = new WebPubSubServiceClient(
    process.env.WebPubSubConnectionString,
    process.env.hubName
  );
  const token = await serviceClient.getClientAccessToken({
    userId: req.headers["x-ms-client-principal-name"],
  });
  context.res = { body: token };
};
