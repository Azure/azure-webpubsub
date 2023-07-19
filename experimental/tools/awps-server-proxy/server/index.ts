// a command tool accepting parameters
// host the website
// start the server connection

// temp: show how to project reference the common project
import { WebPubSubEventHandler } from "@azure/web-pubsub-express";
import { InprocessServerProxy } from "awps-tunnel-proxies";
var host = "http://localhost:8080";
var key = "";
var connectionString = process.env["WebPubSubConnectionString"] || `Endpoint=${host};AccessKey=${key}`;

const hub = "chat";

const handler = new WebPubSubEventHandler(hub, {
  path: "/eventhandler",
  handleUserEvent(req, res) {
    // Quick test: in F12 browser establish a connection and send messages through
    // var ws = new WebSocket("ws://{host}/client/hubs/chat?access_token={token}");
    // ws.send("text"); ws.send("binary"); ws.send("others");
    if (req.dataType === "text") {
      if (req.data === "text") {
        res.success("Hello", "text");
        return;
      } else if (req.data === "binary") {
        // try binary here
        res.success(new TextEncoder().encode(req.data + " response"), "binary");
      } else {
        res.success(JSON.stringify({ a: "Hello" }), "json");
      }
    } else {
      res.fail(400, "Invalid data type " + req.dataType);
    }
  },
});

const middleware = handler.getMiddleware();

const tunnel = InprocessServerProxy.fromConnectionString(connectionString, hub, middleware);
tunnel.runAsync();
