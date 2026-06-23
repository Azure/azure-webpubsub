# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## What changes from the original create-react-app
1. Adding server.js using Express to serve the client app and providing a `negotiate` endpoint for the client to get the `Client Access URI`
1. adding a npm command `npm run server` to build the client app and running the Expressserver
1. update src/App.js to create a WebSocket connection


## How to run
```
export WebPubSubConnectionString=”Your_Connection_String”
npm install
npm run server
```