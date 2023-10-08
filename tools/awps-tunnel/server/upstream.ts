import express from "express";
import { Server } from "http";
import { WebPubSubEventHandler } from "@azure/web-pubsub-express";
import { createLogger } from "./logger";
const logger = createLogger("upstreamServer");
export async function startUpstreamServer(port: number, hub: string, path: string): Promise<Server> {
  return new Promise((resolve, reject) => {
    const app = express();
    const handler = new WebPubSubEventHandler(hub, {
      path: path,
      handleConnect(_, res) {
        logger.info(`Connect triggered`);
        res.success();
      },
      handleUserEvent(_, res) {
        logger.info(`User event triggered`);
        res.success();
      },
      onConnected() {
        logger.info(`Connected triggered`);
      },
      onDisconnected() {
        logger.info(`Disconnected triggered`);
      },
    });
    app.use(handler.getMiddleware());
    try {
      const server = app.listen(port, () => {
        logger.info(`Embedded upstream server started on port ${port}`);
        resolve(server);
      });
    } catch (err) {
      reject(err);
    }
  });
}
