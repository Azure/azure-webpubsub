const { createProxyMiddleware } = require("http-proxy-middleware");
const { env } = require("process");
// TODO: adding expreess support
const port = env.ASPNETCORE_HTTPS_PORT || env.EXPRESS_PORT;
const target = port ? `http://localhost:${port}` : env.ASPNETCORE_URLS ? env.ASPNETCORE_URLS.split(";")[0] : "http://localhost:18274";

const context = ["/dataHub", "/socket.io"];

module.exports = function (app) {
  const appProxy = createProxyMiddleware(context, {
    target: target,
    secure: false,
    ws: true,
    headers: {
      Connection: "Keep-Alive",
    },
  });

  app.use(appProxy);
};
