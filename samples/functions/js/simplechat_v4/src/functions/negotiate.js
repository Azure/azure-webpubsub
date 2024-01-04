const { app, input } = require('@azure/functions');

const connection = input.generic({
    type: 'webPubSubConnection',
    name: 'connection',
    userId: '{query.userId}',
    hub: 'sample_funcchatv4',
    connection: "WpsConnectionString",
});

app.http('negotiate', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    extraInputs: [connection],
    handler: async (request, context) => {
        return { body: JSON.stringify(context.extraInputs.get('connection')), headers: { 'Content-Type': 'application/json' }};
    },
});
