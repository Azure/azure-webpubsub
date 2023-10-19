import express from "express";
import { Server } from "http";
import { WebPubSubEventHandler } from "@azure/web-pubsub-express";
import { printer } from "./output";

export async function startUpstreamServer(port: number, hub: string, path: string): Promise<Server> {
  return new Promise((resolve, reject) => {
    const app = express();
    const handler = new WebPubSubEventHandler(hub, {
      path: path,
      handleConnect(_, res) {
        printer.log(`[Upstream] Connect triggered`);
        res.success();
      },
      handleUserEvent(req, res) {
        printer.log(`[Upstream] User event triggered`);
        if (req.dataType === "text") {
          res.success(`Echo back ${req.data}`, req.dataType);
        } else if (req.dataType === "json") {
          res.success(`Echo back: ${JSON.stringify(req.data)}`, req.dataType);
        } else {
          res.success(req.data, req.dataType);
        }
      },
      onConnected() {
        printer.log(`[Upstream] Connected triggered`);
      },
      onDisconnected() {
        printer.log(`[Upstream] Disconnected triggered`);
      },
    });
    app.use(handler.getMiddleware());
    try {
      const server = app.listen(port, () => {
        resolve(server);
      });
    } catch (err) {
      reject(err);
    }
  });
}
