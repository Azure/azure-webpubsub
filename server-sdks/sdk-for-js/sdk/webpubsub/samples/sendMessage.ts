import { WebPubSubServer } from "../src/webPubSubServer";
import * as dotenv from "dotenv";
dotenv.config();

const server = new WebPubSubServer(process.env.WPS_CONNECTION_STRING!, 'chat');


const endpoint = server.endpoint;
console.log(endpoint.clientNegotiate('chat'));

const chatServer = server.createServiceClient();
async function main() {
  try{

  // send a text message directly to a user
  await chatServer.sendToAll("c bterlson Hi there!");

  }catch (err){
    console.error(err);
  }
  // // send a text message to a specific connection
  // await chatServer.sendToConnection("Tn3XcrAbHI0OE36XvbWwige4ac096c1", "Hi there!");
}

main();
