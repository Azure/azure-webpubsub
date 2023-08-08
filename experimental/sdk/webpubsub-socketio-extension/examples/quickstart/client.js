import { io } from "socket.io-client";

const webPubSubEndpoint = "http://localhost:8080"
const socket = io(webPubSubEndpoint, {
    path: "/clients/socketio/hubs/eio_hub",
});

// receive a message from the server
socket.on("hello", (arg) => {
    console.log(arg);
});

// send a message to the server
socket.emit("howdy", "stranger")