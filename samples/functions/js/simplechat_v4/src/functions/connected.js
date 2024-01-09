const { app, output, trigger } = require('@azure/functions');

const wpsMsg = output.generic({
    type: 'webPubSub',
    name: 'actions',
    hub: 'sample_funcchat',
});

const wpsTrigger = trigger.generic({
    type: 'webPubSubTrigger',
    name: 'request',
    hub: 'sample_funcchat',
    eventName: 'connected',
    eventType: 'system'
});

app.generic('connected', {
    trigger: wpsTrigger,
    extraOutputs: [wpsMsg],
    handler: async (request, context) => {
        context.extraOutputs.set(wpsMsg, [{
            "actionName": "sendToAll",
            "data": `[SYSTEM] ${request.connectionContext.userId} is connected`,
            "dataType": `text`
        },
        {
            "actionName": "addUserToGroup",
            "group": "group1",
            "userId": request.connectionContext.userId,
        },
        {
            "actionName": "sendToGroup",
            "group": "group1",
            "data": `[SYSTEM] ${request.connectionContext.userId} joined group: group1`,
            "dataType": `text`
        }
    ]);
    }
});
