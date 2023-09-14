# Authenication samples of Web PubSub for Socket.IO

This repo contains three samples showing how to authenciate in the most common practice of using `express` + `express-session` + `passport` with Web PubSub for Socket.IO. 

You could compare their pros and cons then select the one that fit you best.

## Explaination
### Accessiblity to passport and session for Socket.IO middleware
In sample `session-auth.js`, the Socket.IO middleware can access both passport information `req.request.user` and session object `req.request.session`. This workflow provides the 

### Accessiblity to passport for Socket.IO middleware
In sample `passport-auth`, the Socket.IO middleware can access passport information by `req.request.user`. However, the session information is inaccessiable for Socket.IO middleware

### Customized accessibility for Socket.IO middleware
Sample `custom-auth` shows how to authenicate your app in a customized way. You could put whatever you want into the reponse for negotiation request. Then you should write your own Socket.IO middleware, get what you just put in from `socket.request["claims"]` then complete your ownthe authenication workflow.

## How to use

### Update endpoint in `public/index.html`

```js
const webPubSubEndpoint = "https://<host name of web pubsub for socket.io>";
```

### Run the server

```bash
npm install
# Same for passport-auth.js and custom-auth.js
node session-auth.js "<connection-string>"
```
