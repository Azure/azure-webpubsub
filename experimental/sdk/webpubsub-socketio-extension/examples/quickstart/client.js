const io = require("socket.io-client");

const webPubSubEndpoint = process.argv[2] || process.env.WebPubSubEndpoint|| "<web-pubsub-socketio-endpoint>";
const socket = io(webPubSubEndpoint, {
    path: "/clients/socketio/hubs/eio_hub",
});

// receive a message from the server
socket.on("hello", (arg) => {
    console.log(arg);
});

// send a message to the server
socket.emit("howdy", "stranger")