import { Server } from "socket.io";
import { useAzureSocketIO } from "@azure/web-pubsub-socket.io";

// Add a Web PubSub Option
const wpsOptions = {
    hub: "eio_hub",
    connectionString: process.argv[2] || process.env.WebPubSubConnectionString,
};

const io = new Server(3000);
useAzureSocketIO(io, wpsOptions);

io.on("connection", (socket) => {
    // send a message to the client
    socket.emit("hello", "world");

    // receive a message from the client
    socket.on("howdy", (arg) => {
        console.log(arg);   // prints "stranger"
    })
});
