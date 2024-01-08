const { app, trigger } = require('@azure/functions');

const wpsTrigger = trigger.generic({
    type: 'webPubSubTrigger',
    name: 'request',
    hub: 'sample_funcchatv4',
    eventName: 'connect',
    eventType: 'system'
});

app.generic('connect', {
    trigger: wpsTrigger,
    handler: async (request, context) => {
        return {
            "userId": request.connectionContext.userId,
        };
    }
});
