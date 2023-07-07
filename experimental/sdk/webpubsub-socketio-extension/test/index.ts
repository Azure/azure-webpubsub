"use strict";

import * as dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

// Add an Web PubSub Option
const wpsOptions = {
  hub: process.env.WebPubSubHub,
  path: process.env.WebPubSubPath,
  connectionString: process.env.WebPubSubConnectionString,
};
console.debug("Unit Test Configuration:", JSON.stringify(wpsOptions));

describe("WebPubSub Socket.IO Extension", () => {
  if (wpsOptions.hub !== undefined || wpsOptions.path !== undefined || wpsOptions.connectionString !== undefined) {
    require("./SIO/index");
  } else {
    console.log(
      "WebPubSub Socket.IO Extension test skipped. Please set the environment variables in 'test/.env.test' to enable the test."
    );
  }
});
