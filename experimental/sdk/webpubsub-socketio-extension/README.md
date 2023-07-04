# Introduction

This package enables Socket.IO applications be a managed Azure cloud service with the support by Azure Web PubSub Service (AWPS).

With AWPS support, Socket.IO server no longer needs to face a large number of Socket.IO clients, maintain connections and messageing with them directly.

AWPS will scale Socket.IO connections, messaging, broadcasting and any other realtime messaging stuffs for you automatically.

In native Socket.IO design, users have to design and host an extra backplane to achieve scalability and host [Adapter](https://socket.io/docs/v4/adapter/) to support multi-server environment by themselves.

With the help of AWPS, these works are all no needed anymore. Besides, the scalability, performance and reliability of Socket.IO applications will be significantly improved.

# Usage

If you have an existing Socket.IO application, follow steps below:

## 1. Set up Azure Web PubSub resource

Refer to ...

Create a AWPS resource, create a hub and configure it, copy connection string, ...

## 2. Set up server

Assuming your server-side code is:

```typescript
const options = { pingInterval: 15000 };
const io = require("socket.io")(options);
```

With some minor changes, your Socket.IO server will supported by Azure Web PubSub Service:

```javascript
// Add an path option in Socket.IO Server options
const options = { pingInterval: 15000, path: "/eventhandler/" };
// Import this package
const wpsExt = require("webpubsub-socketio-extension");

// Add an Web PubSub Option
const webPubSubOptions = {
  hub: "eio_hub",
  path: "/eventhandler/",
  connectionString: "<web-pubsub-connection-string>",
};

const io = require("socket.io")(options).useAzureWebPubSub(webPubSubOptions);
```

You can also authenticate with Web PubSub service using an endpoint and an `AzureKeyCredential`.
Replace `webPubSubOptions` with new value:
```javascript
const { AzureKeyCredential } = require("@azure/web-pubsub");
const key = new AzureKeyCredential("<Key>");

const webPubSubOptions = {
  hub: "eio_hub",
  path: "/eventhandler/",
  endpoint: "<web-pubsub-endpoint>",
  credential: key,
};
```

## 3. Set up client

Assuming your client-side code is:

```javascript
var socket = io("<socket-io-server-endpoint");
```

To fit new Socket.IO server, you shall update the Socket.IO client as below:

```javascript
var socket = io('<web-pubsub-endpoint>', {
    path: "/clients/socketio/hubs/eio_hub"
})
```

# Debug

1. Determine which packages' logs you want to see.

2. Set environmental variable `DEBUG` in your shell according to your wanted packages. Here is a PowerShell examples:

```powershell
# Show log from this package
$Env:DEBUG='wps-sio-ext*'

# Show log from this package + Engine.IO
$Env:DEBUG='wps-sio-ext*,engine*'

# Show log from this package + Engine.IO + Socket.IO
$Env:DEBUG='wps-sio-ext*,engine*,socket.io:*'

# Show logs from all packages
$Env:DEBUG='*'
```

3. Run your Socket.IO application

```bash
node <socket-io-application>.js
```

# Limitations

1. Service-side support is not public yet. This package is only for internal use.
