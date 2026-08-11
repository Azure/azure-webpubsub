# Authenication samples of Web PubSub for Socket.IO

This sample is modified from [psssport-example](https://github.com/socketio/socket.io/tree/4.6.2/examples/passport-example).

This samples shows how to use passport authentication with Web PubSub for Socket.IO. See detail in the [authentication document](https://learn.microsoft.com/en-us/azure/azure-web-pubsub/socketio-authentication).

## How to use

```bash
npm install
export SESSION_SECRET="<random-session-secret>"
export TLS_KEY_PATH="<path-to-tls-private-key.pem>"
export TLS_CERT_PATH="<path-to-tls-certificate.pem>"
npm run start -- <web-pubsub-connection-string>
```

And point your browser to `https://localhost:3000`.