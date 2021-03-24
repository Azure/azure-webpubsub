import { WebPubSubServiceClient } from "../src";

import * as dotenv from "dotenv";
dotenv.config();
const chatServer = new WebPubSubServiceClient('', 'chat');

async function main() {
  // adding and removing users
  const group = "group1";
  const user = "vicancy";
  //var exists = await chatServer.addUserToGroup(group, user);
  //console.log(exists); // true
  //exists = await chatServer.hasUserInGroup(group, user)
  //console.log(exists); // true
  //exists = await chatServer.hasUser(user);
  //console.log(exists); // false

  await chatServer.sendToUser(user, "hello");
  //exists = await chatServer.hasGroup(group);
  //console.log(exists); // false

  //exists = await chatServer.hasConnection("random");
  //console.log(exists); // false

  /* For now it expects 200 while service return 202
  exists =await chatHub.removeUserFromGroup(group, "xirzec");
  console.log(exists);
  exists = await chatHub.removeUserFromGroup(group, user);
  console.log(exists);
  */
}

try {
  main();
} catch (err) {
  console.error(err);
}
