const { once } = require('node:events');
const readline = require('node:readline');
const express = require('express');
const WebSocket = require('ws');
const { WebPubSubServiceClient } = require('@azure/web-pubsub');
const { WebPubSubEventHandler } = require('@azure/web-pubsub-express');

async function main() {
  const hub = 'getting_started';
  const port = Number(process.env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  const connectionString = process.env.WebPubSubConnectionString ||
    'Endpoint=http://localhost:8081;AccessKey=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGH;Version=1.0;';
  // Local HTTP REST calls require this explicit SDK opt-in; TLS checks are not disabled.
  const service = new WebPubSubServiceClient(connectionString, hub, { allowInsecureConnection: true });
  const endpoint = new URL(service.endpoint);
  if (endpoint.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) {
    throw new Error('This local-only sample requires an HTTP loopback emulator endpoint.');
  }

  const app = express();
  const handler = new WebPubSubEventHandler(hub, {
    path: '/eventhandler',
    onConnected: async () => console.log('Event handler: client connected.'),
    handleUserEvent: async (req, res) => {
      await service.sendToAll(req.data, { contentType: 'text/plain' });
      res.success();
    }
  });
  app.use(handler.getMiddleware());

  const server = app.listen(port, '127.0.0.1');
  let socket;
  let input;
  let stopping = false;
  // Unused preconnected sockets are not necessarily closed by server.close().
  const connections = new Map();
  server.on('connection', connection => {
    connections.set(connection, 0);
    connection.once('close', () => connections.delete(connection));
  });
  server.on('request', (req, res) => {
    const connection = req.socket;
    connections.set(connection, connections.get(connection) + 1);
    res.once('finish', () => {
      if (!connections.has(connection)) return;
      const active = connections.get(connection) - 1;
      connections.set(connection, active);
      if (stopping && active === 0) connection.destroySoon();
    });
  });
  try {
    await once(server, 'listening');
    console.log(`Event handler: http://127.0.0.1:${port}/eventhandler`);
    const { url } = await service.getClientAccessToken({ userId: 'console' });
    socket = new WebSocket(url);
    socket.on('message', data => console.log(`Received: ${data.toString()}`));
    socket.on('error', error => console.error(`WebSocket: ${error.message}`));
    socket.on('close', () => {
      if (!stopping) {
        console.error('The emulator connection closed. Restart the sample to reconnect.');
        process.exitCode = 1;
        input?.close();
      }
    });
    await once(socket, 'open');
    console.log('Connected. Type a message and press Enter; Ctrl+C exits.');
    input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of input) {
      if (!line) continue;
      // Wait for the broadcast so piped input also completes the full round trip before exiting.
      const received = once(socket, 'message', { signal: AbortSignal.timeout(10000) });
      socket.send(line);
      await received;
    }
  } finally {
    stopping = true;
    input?.close();
    const closed = new Promise(resolve => server.close(resolve));
    for (const [connection, active] of connections) {
      if (active === 0) connection.destroySoon();
    }
    await closed;
    if (socket?.readyState === WebSocket.OPEN) {
      const disconnected = once(socket, 'close');
      socket.close(1000);
      await disconnected;
    } else {
      socket?.terminate();
    }
  }
}

main().catch(error => {
  console.error(`Sample failed: ${error.message}`);
  process.exitCode = 1;
});
