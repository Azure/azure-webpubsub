const { app, output, trigger } = require('@azure/functions');

const wpsMsg = output.generic({
    type: 'webPubSub',
    name: 'actions',
    hub: 'sample_funcchatv4',
});

const wpsTrigger = trigger.generic({
    type: 'webPubSubTrigger',
    name: 'request',
    hub: 'sample_funcchatv4',
    eventName: 'disconnected',
    eventType: 'system'
});

app.generic('disconnected', {
    trigger: wpsTrigger,
    extraOutputs: [wpsMsg],
    handler: async (request, context) => {
        context.extraOutputs.set(wpsMsg, [{
            "actionName": "sendToAll",
            "data": `[SYSTEM] ${request.connectionContext.userId} is disconnected`,
            "dataType": `text`
        }]);
    }
});
