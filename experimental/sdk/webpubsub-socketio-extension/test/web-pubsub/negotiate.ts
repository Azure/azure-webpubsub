// Modified from // Modified from https://github.com/socketio/socket.io/blob/4.6.2/test/socket.ts

import { Server, getEndpointFullPath, defaultWpsOptions } from "../SIO/support/util";
import { GenerateClientTokenOptions, debugModule } from "../../src/common/utils";
import { parse } from "url";
import { IncomingMessage } from "http";
import expect from "expect.js";

const debug = debugModule("wps-sio-ext:ut");
const serverPort = Number(process.env.SocketIoPort);

describe("negotiate", () => {
  it("works using negotiate", (done) => {
    const getGenerateClientTokenOptions = async (req: IncomingMessage): Promise<GenerateClientTokenOptions> => {
      const query = parse(req.url || "", true).query;
      const username = query["username"] ?? "annoyomous";
      const expirationMinutes = Number(query["expirationMinutes"]) ?? 600;
      return {
        userId: username,
        expirationTimeInMinutes: expirationMinutes,
      } as GenerateClientTokenOptions;
    };

    const io = new Server(
      serverPort,
      {},
      { ...defaultWpsOptions, getGenerateClientTokenOptions: getGenerateClientTokenOptions }
    );

    const username = "bob";
    const rawEndpoint = getEndpointFullPath(process.env.WebPubSubConnectionString ?? "");
    const negotiateUrl = `${rawEndpoint}/socket.io/negotiate/?username=${username}&expirationMinutes=600`;

    fetch(negotiateUrl)
      .then((data) => data.text())
      .then((endpoint) => {
        expect(endpoint.startsWith(rawEndpoint)).to.be(true);
        expect(parse(endpoint, true).query.access_token).to.be.ok();

        // parse JWT token and check its sub claim
        const token = parse(endpoint, true).query.access_token as string;
        const tokenParts = token.split(".");
        expect(tokenParts.length).to.be(3);

        const payload = JSON.parse(Buffer.from(tokenParts[1], "base64").toString());
        expect(payload.sub).to.be(username);
        done();
      });
  });
});
