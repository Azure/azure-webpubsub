# Create a Chat app

## Prerequisites

1. [Node.js](https://nodejs.org)
2. Create an Azure Web PubSub resource
3. [ngrok](https://ngrok.com/download) to expose our localhost to internet

## Setup

```bash
npm install
```

## Start the app

Copy **Connection String** from **Keys** blade of the created Azure Web PubSub service, and replace the `<connection-string>` below with the value of your **Connection String**.

![Connection String](./../../../docs/images/portal_conn.png)

```bash
node server <connection-string>
```

The web app is listening to request at `http://localhost:8080/eventhandler`.

## Use ngrok to expose localhost

```bash
ngrok http 8080
```

`nrgok` will print out an url (`https://<domain-name>.ngrok.io`) that can be accessed from internet, e.g. `http://xxx.ngrok.io`.

## Configure the event handler

Go to the **Settings** blade to configure the event handler for this `chat` hub:

1. Type the hub name (chat) and click "Add".

2. Set URL Pattern to `https://<domain-name>.ngrok.io/eventhandler` and check `connected` in System Event Pattern, click "Save".

![Event Handler](./../../../docs/images/portal_event_handler.png)

## Start the chat

Open http://localhost:8080, input your user name, and send messages.

You can see in the ngrok command window that there are requests coming in with every message sent from the page.
