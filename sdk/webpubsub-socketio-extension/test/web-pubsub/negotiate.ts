// Modified from // Modified from https://github.com/socketio/socket.io/blob/4.6.2/test/socket.ts

import { Server, getEndpointFullPath, defaultWpsOptions, getServer, getPort } from "../SIO/support/util";
import { NegotiateOptions, debugModule } from "../../src/common/utils";
import { parse } from "url";
import { IncomingMessage } from "http";
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

    const ioPromise = getServer(0, {}, { ...defaultWpsOptions, configureNegotiateOptions: configureNegotiateOptions });

    ioPromise.then((io) => {
      const port = getPort(io);
      const endpoint = `http://localhost:${port}`;

      const username = "bob";
      const negotiatePath = `/socket.io/negotiate/?username=${username}&expirationMinutes=600`;

      request(endpoint)
        .get(negotiatePath)
        .buffer(true)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.status).to.be(200);
          const url = JSON.parse(res.text).url;
          const serviceEndpoint = getEndpointFullPath(defaultWpsOptions.connectionString);
          expect(url.startsWith(serviceEndpoint)).to.be(true);
          expect(parse(url, true).query.access_token).to.be.ok();

          // parse JWT token and check its sub claim
          const token = parse(url, true).query.access_token as string;
          const tokenParts = token.split(".");
          expect(tokenParts.length).to.be(3);

          const payload = JSON.parse(Buffer.from(tokenParts[1], "base64").toString());
          expect(payload.sub).to.be(username);
          done();
        });
    });
  });
});
