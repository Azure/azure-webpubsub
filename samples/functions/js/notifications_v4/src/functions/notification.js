const { app, output } = require('@azure/functions');

const wpsAction = output.generic({
    type: 'webPubSub',
    name: 'action',
    hub: 'sample_notification'
});

app.timer('notification', {
    schedule: "*/10 * * * * *",
    extraOutputs: [wpsAction],
    handler: (myTimer, context) => {
        context.extraOutputs.set(wpsAction, {
            actionName: 'sendToAll',
            data: `[DateTime: ${new Date()}] Temperature: ${getValue(22, 1)}\xB0C, Humidity: ${getValue(40, 2)}%`,
            dataType: 'text',
        });
    },
});

function getValue(baseNum, floatNum) {
    return (baseNum + 2 * floatNum * (Math.random() - 0.5)).toFixed(3);
}
