import cors from "cors";
import express from "express";

import { WebPubSubServiceClient } from "@azure/web-pubsub";

import ChatHandler from "./src/ChatHandler";
import SyncHandler from "./src/SyncHandler";

import Builder from "./src/AzureActiveDirectoryExpressMiddlewareBuilder";
import YjsHandler from "./src/YjsHandler";

const aadJwtMiddleware = new Builder().build({
  tenantId: "72f988bf-86f1-41af-91ab-2d7cd011db47",
  audience: [
    "d1924497-dc07-46c4-8f34-3f0587643366", // local
    "b75572d3-6d7d-4148-9a9b-3fc3ea751088", // prod
  ],
});

// let defaultConnectionString =
//   "Endpoint=https://newcodestream.webpubsub.azure.com;AccessKey=KtpvcUkqko8bOdWpLJeeNDpyoA+8qE1aQLuKmBhEwl4=;Version=1.0;";

let defaultConnectionString = "Endpoint=https://test-code-stream.webpubsub.azure.com;AccessKey=AxnhONnatYv61un7fN9ZRD4yXKVdV+dLer0uNqTuf8g=;Version=1.0;"

let connectionString =
  process.argv[2] ||
  process.env.WebPubSubConnectionString ||
  defaultConnectionString;

let chatClient: WebPubSubServiceClient = new WebPubSubServiceClient(
  connectionString ?? "",
  "codestream"
);
let chatHandler = new ChatHandler(
  "codestream",
  "/api/webpubsub/hubs/codestream",
  chatClient
);

let syncClient: WebPubSubServiceClient = new WebPubSubServiceClient(
  connectionString ?? "",
  "sync"
);
let syncHandler = new SyncHandler("sync", "/api/webpubsub/hubs/sync", syncClient)

const app = express();

let corsOptions = {};
const corsMiddleware = cors(corsOptions);

app.options("/negotiate", corsMiddleware);
app.get("/negotiate", [corsMiddleware, aadJwtMiddleware], (req, res) =>
  chatHandler.negotiate(req, res)
);

app.options("/sync/negotiate", corsMiddleware);
app.get("/sync/negotiate", corsMiddleware, (req, res) => syncHandler.client_negotiate(req, res));

app.use(chatHandler.getMiddleware());
app.use(syncHandler.getMiddleware());

app.use(express.static("public"));
app.listen(8080, () => console.log("app started"));
