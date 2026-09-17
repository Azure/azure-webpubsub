"use strict";

import * as dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

// Add an Web PubSub Option
const wpsOptions = {
  hub: process.env.WebPubSubHub,
  connectionString: process.env.WebPubSubConnectionString,
};
if (Boolean(wpsOptions.hub) !== Boolean(wpsOptions.connectionString)) {
  throw new Error("Set both WebPubSubHub and WebPubSubConnectionString to run the live Socket.IO tests.");
}
require("./shutdown");
require("./transport-readiness");
require("./http-helpers");

const liveTests = wpsOptions.hub && wpsOptions.connectionString ? describe : describe.skip;
if (liveTests === describe.skip) {
  console.log(
    "Live Web PubSub Socket.IO tests skipped: configure WebPubSubHub and WebPubSubConnectionString in '.env.test'."
  );
}

// Register the live suite even when skipped, so TypeScript errors cannot hide behind missing credentials.
liveTests("WebPubSub Socket.IO Extension", () => {
  require("./SIO/index");
  require("./web-pubsub/index");
});
