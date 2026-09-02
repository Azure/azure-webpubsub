import express from 'express';
import { WebPubSubServiceClient } from '@azure/web-pubsub';

const hubName = 'chat';
const port = process.env.PORT || 3000;

// Get connection string from environment variable or command line argument
const connectionString = process.env.WebPubSubConnectionString || process.argv[2];
if (!connectionString) {
    console.error('Please provide WebPubSubConnectionString via environment variable or command line argument');
    process.exit(1);
}

const app = express();
const serviceClient = new WebPubSubServiceClient(connectionString, hubName, { allowInsecureConnection: true });

// Negotiate endpoint for client to get access token
app.get('/negotiate', async (req, res) => {
    console.log(`received negotiate request: ${JSON.stringify(req.query)}`);
    const userId = req.query.userId;
    if (!userId) {
        return res.status(500).json({ error: 'userId is required' });
    }
    const token = await serviceClient.getClientAccessToken({ userId });
    res.json({ url: token.url });
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
