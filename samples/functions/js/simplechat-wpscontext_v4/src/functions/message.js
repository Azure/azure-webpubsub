const { app, input, output } = require('@azure/functions');

const wpsContext = input.generic({
    type: 'webPubSubContext',
    name: 'wpsContext'
});

const wpsMsg = output.generic({
    type: 'webPubSub',
    name: 'actions',
    hub: 'sample_funcchatv4',
});

app.http('message', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    extraInputs: [wpsContext],
    extraOutputs: [wpsMsg],
    handler: async (request, context) => {
        var wpsRequest = context.extraInputs.get('wpsContext');

        context.extraOutputs.set(wpsMsg, [{
            "actionName": "sendToAll",
            "data": `[From ${wpsRequest.request.connectionContext.userId}] ${wpsRequest.request.data}`,
            "dataType": request.dataType
        }]);
    }
});
