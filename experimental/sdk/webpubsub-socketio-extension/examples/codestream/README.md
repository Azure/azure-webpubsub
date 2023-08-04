# CodeStream, livestream your code

This is a sample application to demonstrate how to use Web PubSub for Socket.IO to livestream your code to others.

## How to use

1. Create an Web PubSub for Socket.IO resource
2. Go to "Keys" tab and copy the connection string
3. Run the following command with the connection string
   ```bash
   npm install
   node index.js "<connection-string>"
   ```
4. Open `http://localhost:3000`, try to write some code in the code editor
5. Share the link at the top of the page to others, they will see how you code in real time

## How it works

### Server side

The server is express.js server which only does two things:

1. Serve a static web page (`public/index.html`)
2. A REST API (`/negotiate`) which returns a url to connect to Web PubSub for Socket.IO

### Client side

The most logic of this app is happening at client side. In client there're two roles:

1. Streamer. Streamer is the one who writes code and broadcasts to others. It uses `io.emit("message", ...)` to send the changes from the code editor (by hooking the `editor.on('change')` event) to a room (whose ID is generated in negotiate) in Web PubSub for Socket.IO. And for performance consideration, it buffers the changes and send them in a batch every 200 milliseconds. The main implementation can be found at `startStream()` in `public/index.html`.

2. Watcher. Watcher is the one who watches streamer to code. It receives the changes from Web PubSub for Socket.IO and applies them one by one to the code editor (by calling the `applyDelta()` function). Since the changes is only a delta from the previous content there needs to be a way to get the full content from streamer when watcher is connected for the first time. So in this app when watcher is connected it will send a `sync` message to streamer (through another room called `{room_id}-control`) and streamer will send the full content to the room. The main implementation can be found at `watch()` in `public/index.html`.

Since the change is a delta the order of the message matters. So there is a version system (see the `version` variable and how it's used in `public/index.html`) to ensure the messages are processed in order. (For example, it won't apply changes until it receives the full content with a proper version.)
