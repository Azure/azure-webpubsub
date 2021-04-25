# CodeStream, livestream your code

This is a sample application to demonstrate how to use Azure Web PubSub to livestream your code to others.

## How to use

1. Create an Azure Web PubSub resource
2. Go to "Keys" tab and copy the connection string
3. Run the following command with the connection string
   ```bash
   npm install
   node server "<connection-string>"
   ```
4. Open `http://loalhost:8080`, try to write some code in the code editor
5. Share the link at the top of the page to others, they will see how you code in real time

## How it works

### Server side

The server is express.js server which only does two things:

1. Serve a static web page (`public/index.html`)
2. A REST API (`/negotiate`) which returns a url to connect to Web PubSub

### Client side

The most logic of this app is happening at client side.

The client joins a `public` group once it is connected, and every "Send" publishes messages to the `public` group. Note that it uses `ackId` property to check if these actions succeed.