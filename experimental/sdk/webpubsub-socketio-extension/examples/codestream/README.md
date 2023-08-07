# CodeStream, livestream your code

This is a sample application demonstrating how to use Web PubSub for Socket.IO to livestream your code activities to others.

## How to use

1. Create a Web PubSub for Socket.IO resource
2. Go to "Keys" tab and copy the connection string
3. Run the following command with the connection string
   ```bash
   npm install
   node index.js "<connection-string>"
   ```
4. Open `http://localhost:3000`, try to type in some code in the code editor
5. Share the link found at the top of the page to others, they will see your coding actitivies in realtime

## How it works

### Server side
The express.js server does two things:

1. Serves a static web page (`public/index.html`)
2. Serves a REST API (`/negotiate`), which returns a URL to connect to Web PubSub for Socket.IO

### Client side
Most logic is found at the client side. There are two user roles on the client side:
- Writer
- Viewer

1. Writer writes code in a [Monaco-powered code editor](https://microsoft.github.io/monaco-editor/) and broadcasts his/her coding actitivities to others. It uses `io.emit("message", ...)` to send the changes from the code editor to a room. For performance consideration, it buffers the changes and sends them in a batch every 200 milliseconds. The main implementation can be found at `startStream()` in `public/index.html`.

2. Viewers watch writer code. It receives changes from Web PubSub for Socket.IO and applies them one by one to the code editor (by calling the `applyDelta()` function). Since the changes is only a delta from the previous content, there needs to be a way to get the full content from writer when a viewer is connected for the first time. In the design of this app, when a viewer is connected it sends a `sync` message to writer through another room called `{room_id}-control`. Upon receiving such message, the writer sends the full content of the editor to the room. The implementation can be found at `watch()` in `public/index.html`.

Since the change is a delta,  the order of the message matters. We use the `version` variable to ensure the messages are processed in order. Changes will not be applied until a client has received the full content with a proper version.
