const { app, input } = require('@azure/functions');

const wpsContext = input.generic({
    type: 'webPubSubContext',
    name: 'wpsContext'
});

app.http('validate', {
    methods: ['GET', 'OPTIONS'],
    authLevel: 'anonymous',
    extraInputs: [wpsContext],
    handler: async (request, context) => {
        var wpsRequest = context.extraInputs.get('wpsContext');
        return wpsRequest.response;
    }
});
