import {
  WebPubSubClient,
  WebPubSubClientCredential,
  SendToGroupOptions,
  GetClientAccessUrlOptions,
} from "@azure/web-pubsub-client";
import { WebPubSubServiceClient } from "@azure/web-pubsub";
import readline from "readline";
require('dotenv').config({ path: '../.env' });

const hubName = "sample_chat";
const groupName = "testGroup";
const serviceClient = new WebPubSubServiceClient(process.env.WPS_CONNECTION_STRING!, hubName);

const fetchClientAccessUrl = async (_: GetClientAccessUrlOptions) => {
  return (
    await serviceClient.getClientAccessToken({
      roles: [`webpubsub.joinLeaveGroup.${groupName}`, `webpubsub.sendToGroup.${groupName}`],
    })
  ).url;
};

async function main() {
  let client = new WebPubSubClient({
    getClientAccessUrl: fetchClientAccessUrl,
  } as WebPubSubClientCredential);

  client.on("connected", (e) => {
    console.log(`Connection ${e.connectionId} is connected.`);
  });

  client.on("disconnected", (e) => {
    console.log(`Connection disconnected: ${e.message}`);
  });

  await client.start();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on('line', async data => {
    await client.sendToGroup(groupName, data, "text");
  })
}

main().catch((e) => {
  console.error("Sample encountered an error", e);
  process.exit(1);
});
