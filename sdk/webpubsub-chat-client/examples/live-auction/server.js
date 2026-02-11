import express from 'express';
import { WebPubSubServiceClient } from '@azure/web-pubsub';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const hubName = 'chat';
const port = 3000;

const connectionString = process.env.WebPubSubConnectionString || process.argv[2];
if (!connectionString) {
  console.error('Usage: node server.js <WebPubSubConnectionString>');
  console.error('  or set environment variable WebPubSubConnectionString');
  process.exit(1);
}

const app = express();
const serviceClient = new WebPubSubServiceClient(connectionString, hubName, { allowInsecureConnection: true });

// Negotiate endpoint
app.get('/negotiate', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }
  const token = await serviceClient.getClientAccessToken({ userId });
  res.json({ url: token.url });
});

// Serve the SDK browser bundle from the installed package
// TODO: Once published to npm, the client can load the SDK directly from unpkg CDN and this block can be removed.
const sdkPkgDir = path.dirname(require.resolve('@azure/web-pubsub-chat-client/package.json'));
const sdkBrowserDir = path.join(sdkPkgDir, 'dist', 'browser');
app.use('/@azure/web-pubsub-chat-client', express.static(sdkBrowserDir));

// Serve static files
app.use(express.static('public'));

app.listen(port, () => {
  console.log(`Live Auction server running at http://localhost:${port}`);
});
