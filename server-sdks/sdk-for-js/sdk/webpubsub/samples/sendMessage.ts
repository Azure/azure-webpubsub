import { WebPubSubServiceRestClient } from "../src";
import * as dotenv from "dotenv";
dotenv.config();

const client = new WebPubSubServiceRestClient(process.env.WPS_CONNECTION_STRING!, 'chat');


async function main() {
  console.log(await client.getAuthenticationToken({
    userId: "vicancy",
    claims: {
      hey: ["w"],
      role: ["webpubsub.joinLeaveGroup"],
   }
  }));
  try {
    // send a text message directly to a user
    await client.sendToAll("c bterlson Hi there!");
    await client.sendToUser("a", "b");
  } catch (err) {
    console.error(err);
  }
  // // send a text message to a specific connection
  // await chatServer.sendToConnection("Tn3XcrAbHI0OE36XvbWwige4ac096c1", "Hi there!");
}

main();
