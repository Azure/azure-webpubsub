"use strict";

import * as dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

// Add an Web PubSub Option
const wpsOptions = {
  hub: process.env.WebPubSubHub,
  connectionString: process.env.WebPubSubConnectionString,
};
const optS = JSON.stringify(wpsOptions);
console.debug(`Test Config = ${optS.substring(0, 60)}***${optS.slice(-20)}`);

if (wpsOptions.hub !== undefined || wpsOptions.connectionString !== undefined) {
  describe("WebPubSub Socket.IO Extension", () => {
    require("./SIO/index");
    require("./web-pubsub/index");
  });
} else {
  console.log(
    "WebPubSub Socket.IO Extension test skipped. Please set the environment variables in '.env.test' to enable the test."
  );
}
