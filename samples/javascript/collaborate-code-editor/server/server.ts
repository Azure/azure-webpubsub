import cors from "cors";
import express from "express";

import { WebPubSubServiceClient } from "@azure/web-pubsub";

import SyncHandler from "./src/SyncHandler";

let connectionString =
  process.argv[2] ||
  process.env.WebPubSubConnectionString ||
  "";

let syncClient: WebPubSubServiceClient = new WebPubSubServiceClient(
  connectionString ?? "",
  "sync"
);
let syncHandler = new SyncHandler("sync", "/api/webpubsub/hubs/sync", syncClient)

const app = express();

let corsOptions = {};
const corsMiddleware = cors(corsOptions);

app.options("/sync/negotiate", corsMiddleware);
app.get("/sync/negotiate", corsMiddleware, (req, res) => syncHandler.client_negotiate(req, res));

app.use(syncHandler.getMiddleware());

app.use(express.static("public"));
app.listen(8080, () => console.log("app started"));