const { instrument } = require("@socket.io/admin-ui");
const azure = require("@azure/web-pubsub-socket.io");
const express = require('express');
const app = express();
const path = require('path');
const { Namespace, Server } = require("socket.io");
const server = require('http').createServer(app);

// Add an Web PubSub Option
const wpsOptions = {
    hub: "eio_hub",
    connectionString: process.argv[2] || process.env.WebPubSubConnectionString,
    webPubSubServiceClientOptions: { allowInsecureConnection: true }
};
const port = process.env.port || 3000;

async function main() {
    const io = await new Server(server).useAzureSocketIO(wpsOptions);
    app.use(express.static(path.join(__dirname, 'public')));
    app.get("/negotiate", azure.negotiate(io, () => {}));

    // Add Support for Azure Socket.IO Admin UI
    instrument(io, { auth: false, mode: "development", username: "username", password: "assword"});
    Namespace.prototype["fetchSockets"] = async function() { return this.local.fetchSockets(); };

    const echoBenchmark = io.of("/echoBenchmark");

    echoBenchmark.on('connection', (socket) => {
        socket.on('client to server event', (data) => {
            socket.emit("server to client event", (data));
        });
    });

    io.httpServer.listen(port, () => {
        console.log('Visit http://localhost:%d', port);
    });
}

main();