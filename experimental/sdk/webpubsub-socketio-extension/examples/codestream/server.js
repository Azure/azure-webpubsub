// Import the required libraries
const wpsExt = require("@azure/web-pubsub-socket.io");
const express = require('express');
const path = require('path');

// Create an express app
const app = express();
const server = require('http').createServer(app);

app.use(express.static(path.join(__dirname, 'public')));

// Add an Web PubSub Option
const wpsOptions = {
    hub: "eio_hub",
    connectionString: process.argv[2] || process.env.WebPubSubConnectionString,
};

const endpoint = wpsOptions.connectionString.slice(9, wpsOptions.connectionString.indexOf("AccessKey") - 1).replace(";Port=", ":");
console.log(`Endpoint=${endpoint}`);

app.get('/negotiate', async (req, res) => {
    res.json({
        url: endpoint,
        room_id: Math.random().toString(36).slice(2, 7),
    });
});

async function main() {
    const io = await require('socket.io')(server).useAzureSocketIO(wpsOptions);

    io.on('connection', socket => {
        socket.emit("login");

        socket.on('joinRoom', async (message) => {
            const room_id = message["room_id"];
            await socket.join(room_id);

            socket.emit("message", {
                type: "ackJoinRoom", 
                success: true 
            })
        });

        socket.on('sendToRoom', (message) => {
            const room_id = message["room_id"]
            const data = message["data"]

            socket.broadcast.to(room_id).emit("message", {
                type: "editorMessage",
                data: data
            });
        });
    });

    io.httpServer.listen(3000, () => {
        console.log('Visit http://localhost:%d', 3000);
    });
}

main();