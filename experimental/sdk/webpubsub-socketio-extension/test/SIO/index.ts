/**
 * Unit tests under this folder is modified from https://github.com/socketio/socket.io/blob/4.6.1/test/index.ts
 * To fit the Azure Web PubSub Socket.IO extension, some modifications are necessary
 * Here is a list of all kinds of modifications:
 *    - Modification 1:
 *      - Content:
 *        Add `await` for `join`/`leave` of SIO Socket.
 *      - Purpose:
 *        Resolve adapter consistence issue
 *    - Modification 2:
 *      - Concent:
 *        Use a different namespace compared with original unit test.
 *      - Purpose:
 *        Avoid effect from previous client.
 *        In package `socket.io-client`, there is a unexposed variable `cache`.
 *        `cache` is never cleared by the package itself and cannot be cleared from external user.
 *    - Modification 3:
 *      - Content:
 *        Use `spinCheck` to wrap assertion sentences such as `expect(s.rooms).to.contain("a");`
 *      - Purpose:
 *        Same as Modification 1 but more powerful.
 *        Socket.IO server internal, which we cannot modify, uses adapter API without returing its Promise result.
 *    - Modification 4:
 *      - Content:
 *        Explicitly call `userAzureWebPubSub` in unit test
 *     - Purpose:
 *        `useAzureSocketIO` must be used after the http server is created inside Socket.IO Server.
 *        Some tests use constructors of Socket.IO Server which doesn't create http server.
 *        Then they attach an external http server to the Socket.IO Server. So the `util.Server` doesn't fit such cases.
 */

"use strict";

describe("socket.io", () => {
  require("./server-attachment");
  // handshake.ts: CORS is not supported
  require("./namespace");
  require("./socket");
  require("./messaging-many");
  require("./middleware");
  require("./socket-middleware");
  // v2-compatibility.ts: Not supported yet
  require("./socket-timeout");
  // uws.ts: Makes no sense for this package
  require("./utility-methods");
  // connection-state-recovery.ts: Not supported yet

  // TODO: If "./close" is put before "./namespace", the test "should fire a `connection` event" will be extremly slow or fail. Need more investigation.
  require("./close");
});
