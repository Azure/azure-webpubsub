/**
 * This is a template for unit test without mocha, which makes this file starts much faster.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.test" });
import { Server, createClient, getPort, success, successFn, createPartialDone, spinCheck } from "./support/util";

const expect = require("expect.js");
const serverPort = Number(process.env.SocketIoPort);

// Add an Web PubSub Option
const wpsOptions = {
  hub: process.env.WebPubSubHub,
  path: process.env.WebPubSubPath,
  connectionString: process.env.WebPubSubConnectionString,
};
console.debug("Unit Test Configuration:", JSON.stringify(wpsOptions));
const done = (err?: Error) => {
  console.log("done");
};
const partialDone = () => {
  console.log(`partial done`);
};
const partialDone2 = () => {
  console.log(`partial done 2`);
};

// Paste test code below. Sample:
const io = new Server(serverPort);
const socket = createClient(io, "/scacwn");
io.on("connection", (s) => {
  s.on("random", (a, b, c) => {
    expect(a).to.be(1);
    expect(b).to.be("2");
    expect(c).to.eql([3]);

    success(done, io, socket);
  });
  socket.emit("random", 1, "2", [3]);
});
