const { app, input } = require('@azure/functions');

const wpsContext = input.generic({
    type: 'webPubSubContext',
    name: 'wpsContext'
});

app.http('connect', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    extraInputs: [wpsContext],
    handler: async (request, context) => {
        var wpsRequest = context.extraInputs.get('wpsContext');

        return { "userId": wpsRequest.request.connectionContext.userId };
    }
});
