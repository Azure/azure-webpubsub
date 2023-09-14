const { createProxyMiddleware } = require("http-proxy-middleware");
const { env } = require("process");
// TODO: adding expreess support
const port = env.ASPNETCORE_HTTPS_PORT || env.AWPS_TUNNEL_SERVER_PORT;

// when aspnetcore url is set always use it
const target = env.ASPNETCORE_URLS ? env.ASPNETCORE_URLS.split(";")[0] : port ? `http://localhost:${port}` : "http://localhost:18274";

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
