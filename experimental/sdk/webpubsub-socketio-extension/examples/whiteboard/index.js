const wpsExt = require("webpubsub-socket.io")
const express = require('express');
const app = express();
const http = require('http').Server(app);

const wpsOptions = {
  hub: "eio_hub",
  path: "/eventhandler/",
  connectionString: process.argv[2] || process.env.WebPubSubConnectionString || "Endpoint=http://localhost;Port=8080;AccessKey=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGH;Version=1.0;",
  webPubSubServiceClientOptions: { allowInsecureConnection: true }
}

const eioOptions = {
  path: "/eventhandler/",
}

const io = require('socket.io')(http, eioOptions).useAzureWebPubSub(wpsOptions);
const port = process.env.PORT || 3000;

app.use(express.static(__dirname + '/public'));

io.on('connection', (socket) => {
  socket.on('drawing', (data) => socket.broadcast.emit('drawing', data));
});

http.listen(port, () => {
  console.log('Visit http://localhost:%d', port);
  console.log("MAKE sure `useWps` in public/main.js is true");
});
