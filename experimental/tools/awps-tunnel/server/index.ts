// a command tool accepting parameters
// host the website
// start the server connection
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createServer } from "http";
import path from "path";
import { DataHub } from "./dataHub";
import { HttpServerProxy } from "./serverProxies";
import { ConnectionStatus, ConnectionStatusPairs } from "../client/src/models";
import { logger } from "./logger";

// temp: show how to project reference the common project
var connectionString = process.env.WebPubSubConnectionString;
if (!connectionString) throw Error("Invalid connection string");

const hub = "chat";
const upstreamUrl = "http://localhost:3333";
const app = express();
const server = createServer(app);
const tunnel = HttpServerProxy.fromConnectionString(connectionString, hub, { target: upstreamUrl });
const dataHub = new DataHub(server, tunnel, upstreamUrl);
dataHub.ReportStatusChange(ConnectionStatus.Connecting);
tunnel.runAsync({
  onProxiedRequestEnd: (request, arrivedAt, proxiedUrl, response, err) => {
    if (err) {
      logger.error(`Error on proxy request ${proxiedUrl}: ${err}`);
      dataHub.ReportTunnelToLocalServerStatus(ConnectionStatusPairs.Disconnected);
    } else {
      logger.info(`Success on getting proxy response ${proxiedUrl}: ${response.StatusCode}`);
      if (response.StatusCode < 400) {
        dataHub.ReportTunnelToLocalServerStatus(ConnectionStatusPairs.Connected);
      } else {
        dataHub.ReportTunnelToLocalServerStatus(ConnectionStatusPairs.ErrorResponse);
      }
    }
    const decoder = new TextDecoder("utf-8");
    dataHub.UpdateTraffics([
      {
        code: response.StatusCode,
        methodName: request.HttpMethod,
        url: request.Url,
        requestRaw: decoder.decode(request.Content),
        responseRaw: decoder.decode(response.Content),
        requestAtOffset: arrivedAt,
        unread: true,
      }
    ]);
  },
}).then(() => {
  dataHub.ReportStatusChange(ConnectionStatus.Connected);
}).catch((err) => {
  logger.error(`Error on tunnel connection: ${err}`);
  dataHub.ReportStatusChange(ConnectionStatus.Disconnected);
});

const port = process.env.EXPRESS_PORT || 8080;

app.use(express.static(path.join(__dirname, "../client/build")));
server.listen(port, () => {
  console.log(`Open webview at: http://localhost:${port}`);
});
