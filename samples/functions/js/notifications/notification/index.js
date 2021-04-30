module.exports = function (context, myTimer) {
    context.bindings.webPubSubOperation = {
        "operationKind": "sendToAll",
        "message": `[DateTime: ${new Date()}] Temperature: ${getValue(22, 1)}\xB0C, Humidity: ${getValue(40, 2)}%`,
        "dataType": "text"
    }
    context.done();
};

function getValue(baseNum, floatNum) {
    return (baseNum + 2 * floatNum * (Math.random() - 0.5)).toFixed(3);
}