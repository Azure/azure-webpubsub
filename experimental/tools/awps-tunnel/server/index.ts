// a command tool accepting parameters
// host the website
// start the server connection
import dotenv from "dotenv";
import { ConnectionStatus } from "../client/src/models";

dotenv.config();

// 1. provide signalr/ datahub

// temp: show how to project reference the common project
import { HttpServerProxy } from "./serverProxies";
var host = "http://localhost:8080";
var key = "";
var connectionString = process.env.WebPubSubConnectionString || `Endpoint=${host};AccessKey=${key}`;

const hub = "chat";

const tunnel = HttpServerProxy.fromConnectionString(connectionString, hub);
tunnel.runAsync();

import express from "express";
import { createServer } from "http";
import path from "path";
import { Server, Socket } from "socket.io";
const app = express();

const server = createServer(app);
const io = new Server(server);
const port = process.env.EXPRESS_PORT || 8080;
const website = `http://localhost:${port}`;

app.use(express.static(path.join(__dirname, "../client/build")));

// Socket.io event handling
io.on("connection", (socket: Socket) => {
  console.log("A user connected");

  socket.on("getCurrentModel", (callback) => {
    callback({
      ready: true,
      endpoint: "http://A",
      hub: "chat",
      clientUrl: "http://E",
      liveTraceUrl: "http://D",
      upstreamServerUrl: "http://F",
      tunnelConnectionStatus: ConnectionStatus.Connected,
      trafficHistory: [],
      tunnelServerStatus: {
        statusIn: ConnectionStatus.Connected,
        statusOut: ConnectionStatus.Connected,
      },
      logs: [],
    });
    socket.on("getClientAccessUrl", (callback) => {
      callback("http://ABC");
    });
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected");
  });
});

server.listen(port, () => {
  console.log(`listening on ${website}`);
});
