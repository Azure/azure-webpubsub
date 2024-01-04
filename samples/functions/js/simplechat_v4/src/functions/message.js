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
        eventName: 'message',
        eventType: 'user',
        connection: "WpsConnectionString",
});

app.generic('message', {
    trigger: wpsTrigger,
    extraOutputs: [wpsMsg],
    handler: async (request, context) => {
        context.extraOutputs.set(wpsMsg, [{
            "actionName": "sendToAll",
            "data": `[From ${context.triggerMetadata.connectionContext.userId}] ${request.data}`,
            "dataType": request.dataType
        }]);
    }
});
