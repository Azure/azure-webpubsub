import express from 'express';
import { WebPubSubServiceClient } from '@azure/web-pubsub';
import { WebPubSubEventHandler } from '@azure/web-pubsub-express';

const hubName = 'chat';
const port = 3000 || process.env.PORT

// Get connection string from environment variable or command line argument
const connectionString = process.env.WebPubSubConnectionString || process.argv[2];
if (!connectionString) {
    console.error('Please provide WebPubSubConnectionString via environment variable or command line argument');
    process.exit(1);
}

const app = express();
const serviceClient = new WebPubSubServiceClient(connectionString, hubName, { allowInsecureConnection: true });

const handler = new WebPubSubEventHandler(hubName, {
    path: '/eventhandler',
    onConnected: async (req) => {
        console.log(`${req.context.userId} connected`);
    },
});

app.use(handler.getMiddleware());

// Negotiate endpoint for client to get access token
app.get('/negotiate', async (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
        return res.status(500).json({ error: 'userId is required' });
    }
    const token = await serviceClient.getClientAccessToken({ userId });
    res.json({ url: token.url });
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
    console.log(`Event handler path: ${handler.path}`);
});
