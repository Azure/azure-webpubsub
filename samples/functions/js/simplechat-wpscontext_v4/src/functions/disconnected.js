const { app, input, output } = require('@azure/functions');

const wpsContext = input.generic({
    type: 'webPubSubContext',
    name: 'wpsContext'
});

const wpsMsg = output.generic({
    type: 'webPubSub',
    name: 'actions',
    hub: 'sample_funcchat',
});

app.http('disconnected', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    extraInputs: [wpsContext],
    extraOutputs: [wpsMsg],
    handler: async (request, context) => {
        var wpsRequest = context.extraInputs.get('wpsContext');

        context.extraOutputs.set(wpsMsg, [{
            "actionName": "sendToAll",
            "data": `[SYSTEM] ${wpsRequest.request.connectionContext.userId} is disconnected`,
            "dataType": `text`
        }]);
    }
});
