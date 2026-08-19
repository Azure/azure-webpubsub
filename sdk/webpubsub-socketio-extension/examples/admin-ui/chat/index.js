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
    instrument(io, { auth: false, mode: "development" });
    Namespace.prototype["fetchSockets"] = async function() { return this.local.fetchSockets(); };

    let numUsers = 0;

    io.on('connection', socket => {
        let addedUser = false;

        // when the client emits 'new message', this listens and executes
        socket.on('new message', (data) => {
            // we tell the client to execute 'new message'
            socket.broadcast.emit('new message', {
                username: socket.username,
                message: data
            });
        });

        // when the client emits 'add user', this listens and executes
        socket.on('add user', (username) => {
            if (addedUser) return;

            // we store the username in the socket session for this client
            socket.username = username;
            ++numUsers;
            addedUser = true;
            socket.emit('login', {
                numUsers: numUsers
            });
            // echo globally (all clients) that a person has connected
            socket.broadcast.emit('user joined', {
                username: socket.username,
                numUsers: numUsers
            });
        });

        // when the user disconnects.. perform this
        socket.on('disconnect', () => {
            if (addedUser) {
                --numUsers;

                // echo globally that this client has left
                socket.broadcast.emit('user left', {
                    username: socket.username,
                    numUsers: numUsers
                });
            }
        });
    });
    io.httpServer.listen(port, () => {
        console.log('Visit http://localhost:%d', port);
    });
}

main();