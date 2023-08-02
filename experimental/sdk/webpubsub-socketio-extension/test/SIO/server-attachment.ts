/**
 * Note: All tests using `/socket.io` as default path are modified to use customized path.
 */
import { createServer } from "http";
import expect from "expect.js";
import { Server as NativeSioServer } from "socket.io";
import {
  Server,
  enableFastClose,
  getPort,
  success,
  successFn,
  defaultWpsOptions as wpsOptions,
  attachmentPath,
  defaultAttachmentPath,
} from "./support/util";

const request = require("supertest");
const serverPort = Number(process.env.SocketIoPort);

describe("server attachment", () => {
  describe("http.Server", () => {
    const clientVersion = require("socket.io-client/package.json").version;
    console.log(`clientVersion: ${clientVersion}`);

    const testSource = (filename) => (done) => {
      const srv = createServer().listen(serverPort);
      const io = new Server(srv);
      request(srv)
        .get(attachmentPath(filename))
        .buffer(true)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.headers["content-type"]).to.be("application/javascript; charset=utf-8");
          expect(res.headers.etag).to.be('"' + clientVersion + '"');
          expect(res.headers["x-sourcemap"]).to.be(undefined);
          expect(res.text).to.match(/engine\.io/);
          expect(res.status).to.be(200);
          success(done, io);
        });
    };

    const testSourceMap = (filename) => (done) => {
      const srv = createServer();
      const io = new Server(srv);
      request(srv)
        .get(attachmentPath(filename))
        .buffer(true)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.headers["content-type"]).to.be("application/json; charset=utf-8");
          expect(res.headers.etag).to.be('"' + clientVersion + '"');
          expect(res.text).to.match(/engine\.io/);
          expect(res.status).to.be(200);
          success(done, io);
        });
    };

    it("should serve client", testSource("socket.io.js"));
    it("should serve client with query string", testSource("socket.io.js?buster=" + Date.now()));
    it("should serve source map", testSourceMap("socket.io.js.map"));
    it("should serve client (min)", testSource("socket.io.min.js"));

    it("should serve source map (min)", testSourceMap("socket.io.min.js.map"));

    it("should serve client (gzip)", (done) => {
      const srv = createServer();
      const io = new Server(srv);
      request(srv)
        .get(defaultAttachmentPath)
        .set("accept-encoding", "gzip,br,deflate")
        .buffer(true)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.headers["content-encoding"]).to.be("gzip");
          expect(res.status).to.be(200);
          success(done, io);
        });
    });

    it("should serve bundle with msgpack parser", testSource("socket.io.msgpack.min.js"));

    it("should serve source map for bundle with msgpack parser", testSourceMap("socket.io.msgpack.min.js.map"));

    it("should serve the ESM bundle", testSource("socket.io.esm.min.js"));

    it("should serve the source map for the ESM bundle", testSourceMap("socket.io.esm.min.js.map"));

    it("should handle 304", (done) => {
      const srv = createServer();
      const io = new Server(srv);
      request(srv)
        .get(defaultAttachmentPath)
        .set("If-None-Match", '"' + clientVersion + '"')
        .end((err, res) => {
          if (err) return done(err);
          expect(res.statusCode).to.be(304);
          success(done, io);
        });
    });

    it("should handle 304", (done) => {
      const srv = createServer();
      const io = new Server(srv);
      request(srv)
        .get(defaultAttachmentPath)
        .set("If-None-Match", 'W/"' + clientVersion + '"')
        .end((err, res) => {
          if (err) return done(err);
          expect(res.statusCode).to.be(304);
          success(done, io);
        });
    });

    it("should not serve static files", (done) => {
      const srv = createServer();
      const io = new Server(srv, { serveClient: false });
      request(srv)
        .get(defaultAttachmentPath)
        .expect(400, () => {
          success(done, io);
        });
    });

    /**
     * Note: This test is modified. See "Modification 4" in test.ts
     */
    it("should work with #attach", (done) => {
      const srv = createServer((req, res) => {
        res.writeHead(404);
        res.end();
      });
      const io = new NativeSioServer();
      io.attach(srv);

      io.useAzureSocketIO(wpsOptions);
      enableFastClose(io);

      request(srv)
        .get(defaultAttachmentPath)
        .end((err, res) => {
          if (err) return done(err);
          expect(res.status).to.be(200);
          success(done, io);
        });
    });

    /**
     * Note: This test is modified. See "Modification 4" in test.ts
     */
    it("should work with #attach (and merge options)", (done) => {
      const srv = createServer((req, res) => {
        res.writeHead(404);
        res.end();
      });
      const server = new NativeSioServer(0, {
        pingTimeout: 6000,
      });
      server.attach(srv, {
        pingInterval: 24000,
      });
      server.useAzureSocketIO(wpsOptions);
      enableFastClose(server);

      // @ts-ignore
      expect(server.eio.opts.pingTimeout).to.eql(6000);
      // @ts-ignore
      expect(server.eio.opts.pingInterval).to.eql(24000);
      success(done, server);
    });
  });

  describe("port", () => {
    it("should be bound", (done) => {
      const io = new Server(serverPort);

      setTimeout(() => {
        request(`http://localhost:${getPort(io)}`)
          .get(defaultAttachmentPath)
          .expect(200, successFn(done, io));
      }, 200);
    });

    /**
     * Note: This test is modified. See "Modification 4" in test.ts
     */
    it("with listen", (done) => {
      const io = new NativeSioServer().listen(serverPort);
      io.useAzureSocketIO(wpsOptions);
      enableFastClose(io);

      request(`http://localhost:${getPort(io)}`)
        .get(defaultAttachmentPath)
        .expect(200, successFn(done, io));
    });
  });
});
