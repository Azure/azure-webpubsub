module.exports = function (context, IoTHubMessages) {
  IoTHubMessages.forEach((message) => {
    const deviceMessage = JSON.parse(message);
    context.log(`Processed message: ${message}`);
    context.bindings.actions = {
      actionName: "sendToAll",
      data: JSON.stringify({
        IotData: deviceMessage,
        MessageDate: deviceMessage.date || new Date().toISOString(),
        DeviceId: deviceMessage.deviceId,
      }),
    };
  });

  context.done();
};
