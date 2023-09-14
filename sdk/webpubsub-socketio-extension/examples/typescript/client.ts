import { io } from "socket.io-client";

const endpoint = "https://<web-pubsub-for-socketio-hostname>";
const socket = io(endpoint, {
    path: "/clients/socketio/hubs/eio_hub",
    reconnection: false
});

socket.on("connect", () => {
    console.log(`connect ${socket.id}`);
});

socket.on("disconnect", () => {
    console.log(`disconnect`);
});

setInterval(() => {
    const start = Date.now();
    socket.emit("ping", () => {
        console.log(`pong (latency: ${Date.now() - start} ms)`);
    });
}, 1000);
