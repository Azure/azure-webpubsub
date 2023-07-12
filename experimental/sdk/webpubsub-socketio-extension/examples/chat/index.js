const wpsExt = require("@azure/web-pubsub-socket.io");
// Setup basic express server
const express = require('express');
const app = express();
const path = require('path');
const server = require('http').createServer(app);

// Add an Web PubSub Option
const wpsOptions = {
    hub: "eio_hub",
    path: "/eventhandler/",
    connectionString: process.argv[2] || process.env.WebPubSubConnectionString,
    webPubSubServiceClientOptions: { allowInsecureConnection: true }
};

const opts = {
    path: "/eventhandler/"
}

const io = require('socket.io')(server, opts).useAzureSocketIO(wpsOptions);

app.use(express.static(path.join(__dirname, 'public')));

// Chatroom

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

io.httpServer.listen(3000, () => {
    console.log('Visit http://localhost:%d', 3000);
});