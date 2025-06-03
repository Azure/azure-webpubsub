const { app, input } = require('@azure/functions');

const socketIONegotiate = input.generic({
    type: 'socketionegotiation',
    direction: 'in',
    name: 'result',
    hub: 'hub'
});

async function negotiate(request, context) {
    let result = context.extraInputs.get(socketIONegotiate);
    return { jsonBody: result };
};

// Negotiation
app.http('negotiate', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    extraInputs: [socketIONegotiate],
    handler: negotiate
});