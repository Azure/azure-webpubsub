// Modified from // Modified from https://github.com/socketio/socket.io/blob/4.6.2/test/socket.ts

import { Server, getEndpointFullPath, defaultWpsOptions } from "../SIO/support/util";
import { debugModule } from "../../src/common/utils";
import { parse } from "url";
import expect from "expect.js";

const debug = debugModule("wps-sio-ext:ut");
const serverPort = Number(process.env.SocketIoPort);

describe("negotiate", () => {
  it("works using default negotiate handler", (done) => {
    const io = new Server(serverPort);

    const username = "bob";
    const rawEndpoint = getEndpointFullPath(process.env.WebPubSubConnectionString ?? "");
    const negotiateUrl = `${rawEndpoint}/socket.io/negotiate/username=${username}`;

    fetch(negotiateUrl)
      .then((data) => data.text())
      .then((endpoint) => {
        expect(endpoint.startsWith(rawEndpoint)).to.be(true);
        // check `access_token` from query string 
        expect(parse(endpoint, true).query.access_token).to.be.ok();

        // check JWT token and its `sub` claim
        const token = parse(endpoint, true).query.access_token as string;
        const tokenParts = token.split(".");
        expect(tokenParts.length).to.be(3);

        const payload = JSON.parse(Buffer.from(tokenParts[1], "base64").toString());
        expect(payload.sub).to.be(username);
        done();
      });
  });

  it("works using customized negotiate handler", (done) => {
      const negotiateHandler = async (req, res, getClientAccessToken) => {
        let statusCode = 400, message = "Bad Request";
        try{
            const username = parse(req.url || "", true).query["username"];
            const endpointWithToken = await getClientAccessToken({userId: username ?? ""});
            statusCode = 200;
            message = endpointWithToken;
        }
        catch (e) {
            statusCode = 400;
            message = e.message;
        }
        finally {
            res.writeHead(statusCode, { "Content-Type": "text/plain" });
            res.end(message);
        }
    };

    const io = new Server(serverPort, null, {...defaultWpsOptions, negotiate: negotiateHandler});

    const username = "bob";
    const rawEndpoint = getEndpointFullPath(process.env.WebPubSubConnectionString ?? "");
    const negotiateUrl = `${rawEndpoint}/socket.io/negotiate/username=${username}`;

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
