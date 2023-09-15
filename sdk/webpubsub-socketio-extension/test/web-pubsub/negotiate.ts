// Modified from // Modified from https://github.com/socketio/socket.io/blob/4.6.2/test/socket.ts

import { Server, getEndpointFullPath, defaultWpsOptions, getServer, getPort } from "../SIO/support/util";
import { NegotiateOptions, debugModule } from "../../src/common/utils";
import { negotiate } from "../../src";
import { parse } from "url";
import { IncomingMessage, ServerResponse, createServer } from "http";
import expect from "expect.js";
const request = require("supertest");

const debug = debugModule("wps-sio-ext:ut");

describe("negotiate", () => {
  it("works using negotiate", (done) => {
    const configureNegotiateOptions = async (req: IncomingMessage): Promise<NegotiateOptions> => {
      const query = parse(req.url || "", true).query;
      const username = query["username"] ?? "annoyomous";
      const expirationMinutes = Number(query["expirationMinutes"]) ?? 600;
      return {
        userId: username,
        expirationTimeInMinutes: expirationMinutes,
      } as NegotiateOptions;
    };

    const negotiateExpressMiddleware = negotiate(defaultWpsOptions, configureNegotiateOptions);
    const httpServer = createServer().listen(3000);
    const ioPromise = getServer(httpServer, {}, defaultWpsOptions );

    ioPromise.then((io) => {
      // We don't have express server in UT. So it will be converted to a Http Server middleware later.
      io["httpServer"].prependListener("request", (req: IncomingMessage, res: ServerResponse) => {
        if (req.url?.startsWith("/negotiate")) {
          negotiateExpressMiddleware(req, res, () => {});
        }
      });
      const port = getPort(io);
      const endpoint = `http://localhost:${port}`;

      const username = "bob";
      const negotiatePath = `/negotiate/?username=${username}&expirationMinutes=600`;

      request(endpoint)
        .get(negotiatePath)
        .buffer(true)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.status).to.be(200);
          const json = JSON.parse(res.text);
          const endpoint = json.endpoint;
          const token = json.token;

          const serviceEndpoint = getEndpointFullPath(defaultWpsOptions.connectionString);
          expect(serviceEndpoint.startsWith(endpoint)).to.be(true);

          // parse JWT token and check its sub claim
          const tokenParts = token.split(".");
          expect(tokenParts.length).to.be(3);

          const payload = JSON.parse(Buffer.from(tokenParts[1], "base64").toString());
          expect(payload.sub).to.be(username);
          done();
        });
    });
  });
});
