const { app, output, trigger } = require('@azure/functions');

const socketio = output.generic({
  type: 'socketio',
  hub: 'hub',
})

async function chat(request, context) {
    context.extraOutputs.set(socketio, {
      actionName: 'sendToNamespace',
      namespace: '/',
      eventName: 'new message',
      parameters: [
        context.triggerMetadata.socketId,
        context.triggerMetadata.message
      ],
    });
}

// Trigger for new message
app.generic('chat', {
    trigger: trigger.generic({
        type: 'socketiotrigger',
        hub: 'hub',
        eventName: 'chat',
        parameterNames: ['message'],
    }),
    extraOutputs: [socketio],
    handler: chat
});