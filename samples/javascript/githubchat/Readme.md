# Create a Chat app

## Prerequisites

1. [Node.js](https://nodejs.org)
2. Create an Azure Web PubSub resource
3. [ngrok](https://ngrok.com/download) to expose our localhost to internet

## Setup

```bash
npm install
```

## Get Github ClientID

1. Go to https://www.github.com, open your profile -> Settings -> Developer settings
2. Go to OAuth Apps, click "New OAuth App"
3. Fill in application name, homepage URL (can be anything you like), and set Authorization callback URL to `http://localhost:8080/auth/github/callback` (which matches the callback API you exposed in the server)
4. After the application is registered, copy the **Client ID** and click "Generate a new client secret" to generate a new **client secret**

## Start the app
Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, and replace the `<connection-string>` below with the value of your **Connection String**.

![Connection String](./../../../docs/images/portal_conn.png)

Linux:

```bash
export WebPubSubConnectionString="<connection_string>"
export GitHubClientId="<client-id>"
export GitHubClientSecret="<client-secret>"
node server
```

Windows:

```cmd
SET WebPubSubConnectionString=<connection_string>
SET GitHubClientId=<client-id>
SET GitHubClientSecret=<client-secret>
node server
```

The web app is listening to request at `http://localhost:8080/eventhandler/`.

## Use ngrok to expose localhost

```bash
ngrok http 8080
```

`nrgok` will print out an url (`https://<domain-name>.ngrok.io`) that can be accessed from internet, e.g. `http://xxx.ngrok.io`.

## Configure the event handler

Go to the **Settings** tab to configure the event handler for this `chat` hub:

1. Type the hub name (chat) and click "Add".

2. Set URL Pattern to `https://<domain-name>.ngrok.io/eventhandler/{event}` and check `connected` in System Event Pattern, click "Save".

![Event Handler](./../../../docs/images/portal_event_handler.png)

## Start the chat

Open http://localhost:8080, input your user name, and send messages.

You can see in the ngrok command window that there are requests coming in with every message sent from the page.
