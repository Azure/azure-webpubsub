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

app.http('connected', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    extraInputs: [wpsContext],
    extraOutputs: [wpsMsg],
    handler: async (request, context) => {
        var wpsRequest = context.extraInputs.get('wpsContext');

        context.extraOutputs.set(wpsMsg, [{
            "actionName": "sendToAll",
            "data": `[SYSTEM] ${wpsRequest.request.connectionContext.userId} is connected`,
            "dataType": `text`
        },
        {
            "actionName": "addUserToGroup",
            "group": "group1",
            "userId": wpsRequest.request.connectionContext.userId,
        },
        {
            "actionName": "sendToGroup",
            "group": "group1",
            "data": `[SYSTEM] ${wpsRequest.request.connectionContext.userId} joined group: group1`,
            "dataType": `text`
        }]);
    }
});
