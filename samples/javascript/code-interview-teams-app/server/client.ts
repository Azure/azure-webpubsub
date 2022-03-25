
import { WebPubSubServiceClient } from "@azure/web-pubsub";
import { Connection } from "./src/SyncConnection";

let connStr = "Endpoint=https://newcodestream.webpubsub.azure.com;AccessKey=KtpvcUkqko8bOdWpLJeeNDpyoA+8qE1aQLuKmBhEwl4=;Version=1.0;"

let client: WebPubSubServiceClient = new WebPubSubServiceClient(
    connStr,
    "sync"
);