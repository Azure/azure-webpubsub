
# Socket.IO Typescript Demo

A simple Typescript demo for Socket.IO with Azure Web PubSub

## How to use
1. Replace `endpoint` in `client.ts` with your own endpoint from Azure Web PubSub for Socket.IO.

2.
```
$ yarn install
$ yarn start:server <web-pubsub-connection-string>
$ yarn start:client
```

`server-alternative.ts` provides another usage of API. Run it by `yarn start:server-alternative <web-pubsub-connection-string>`.