const azure = require("@azure/web-pubsub-socket.io");
const { AzureCliCredential } = require("@azure/identity");

// Setup basic express server
const express = require('express');
const app = express();
const path = require('path');
const server = require('http').createServer(app);
const parse = require('url').parse;

// option 1: use connection string
const wpsOptions = {
    hub: "eio_hub",
    connectionString: process.argv[2] || process.env.WebPubSubConnectionString,
};

// option 2: use AAD auth
// step 1: in service portal , access control tab, add your account as "Web PubSub Service Owner"
// step 2: choose the credential you want to use, for example, you can call `az login` before running the app and use AzureCliCredential
/*
const wpsOptions = {
    hub: "eio_hub",
    endpoint: "https://sio.webpubsub.azure.com",
    credential: new AzureCliCredential()
};
*/

function authentiacte(username) {
    if (username.length < 10) return true;
    return false;
}

async function main() {
    const configureNegotiateOptions = (req) => {
        const query = parse(req.url || "", true).query
        const username = query["username"] ?? "annoyomous";
        if (!authentiacte(username)) {
            throw new Error(`Authentication Failed for username = ${username}`);
        }
        return {
            userId: username,
        };
    }

    const io = require('socket.io')(server);
    azure.useAzureSocketIO(io, wpsOptions);

    app.get("/negotiate", azure.negotiate(io, configureNegotiateOptions))

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
}

main();