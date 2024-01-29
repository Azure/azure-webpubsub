const { app, output } = require('@azure/functions');

const wpsAction = output.generic({
    type: 'webPubSub',
    name: 'action',
    hub: '%hubName%'
});

app.eventHub('messagehandler', {
    connection: 'IOTHUBConnectionString',
    eventHubName: '%hubName%',
    cardinality: 'many',
    extraOutputs: [wpsAction],
    handler: (messages, context) => {
        var actions = [];
        if (Array.isArray(messages)) {
            context.log(`Event hub function processed ${messages.length} messages`);
            for (const message of messages) {
                context.log('Event hub message:', message);
                actions.push({
                    actionName: "sendToAll",
                    data: JSON.stringify({
                        IotData: message,
                        MessageDate: message.date || new Date().toISOString(),
                        DeviceId: message.deviceId,
                    })});
            }
        } else {
            context.log('Event hub function processed message:', messages);
            actions.push({
                actionName: "sendToAll",
                data: JSON.stringify({
                    IotData: message,
                    MessageDate: message.date || new Date().toISOString(),
                    DeviceId: message.deviceId,
                })});
        }
        context.extraOutputs.set(wpsAction, actions);
    }
});
