const wpsExt = require("@azure/web-pubsub-socket.io")
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')
const fs = require('fs');
const { instrument } = require("@socket.io/admin-ui");

const wpsOptions = {
  hub: "eio_hub",
  connectionString: process.argv[2] || process.env.WebPubSubConnectionString,
}

const debug=false;
const samplingInterval = 20;

async function main() {
    const server = await io(http).useAzureSocketIO(wpsOptions)
    instrument(server, { auth: false, mode: "production", });
    const benchmarkNs = server.of("/benchmark");

    var lastReceivedIndex = 0, lastLogIndex = 0;

    // Client -> Server time
    var min = 10000, max = 0, sum = 0;
    
    benchmarkNs.on('connection', (socket) => {
        if (debug) console.log("client connected to /benchmark")

        socket.on('client to server event', (data) => {
            var now = new Date().getTime();

            // data = {index},{clientSendTimestamp}
            var index = data.split(",")[0];
            var cost = now - data.split(",")[1];

            min = Math.min(min, cost);
            max = Math.max(max, cost);
            sum += cost;
            if (index % samplingInterval == 0) {

                if (debug)
                    console.log(`client -> Server (Last ${samplingInterval}) | \
min: ${min.toString()} ms | \
max: ${max.toString()} ms | \
avg: ${(sum / samplingInterval).toFixed(1)} ms | \
idx: ${(lastLogIndex).toString()} -> ${index.toString()} |`);

                min = 10000, max = 0, sum = 0; lastLogIndex = index;
            }
            
            // data = {index},{clientSendTimestamp},{serverReceiveTimestamp}
            socket.emit("server to client event", (`${data},${now}`));

            lastReceivedIndex = index;
        });
    });

    app.get('/getConfig', (req, res) => {
        const configFileContent = fs.readFileSync('config.json', 'utf-8');
        const opts = JSON.parse(configFileContent);
        res.json(opts);
    });
    server.httpServer.listen(3000, () => {
        console.log('Visit http://localhost:%d', 3000);
    });
}

main()