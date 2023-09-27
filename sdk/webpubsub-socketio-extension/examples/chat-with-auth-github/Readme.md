# Create a Chat app

## Prerequisites

1. [Node.js](https://nodejs.org)
2. Create an Azure Web PubSub resource
3. [localtunnel](https://github.com/localtunnel/localtunnel) to expose our localhost to internet

## Setup

```bash
npm install
```

## Get Github ClientID

1. Go to https://www.github.com, open your profile -> Settings -> Developer settings
2. Go to OAuth Apps, click "New OAuth App"
3. Fill in application name, homepage URL (can be anything you like), and set Authorization callback URL to `http://localhost:3000/auth/github/callback` (which matches the callback API you exposed in the server)
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

## Use localtunnel to expose localhost

[localtunnel](https://github.com/localtunnel/localtunnel) is an open-source project that help expose your localhost to public. [Install the tool](https://github.com/localtunnel/localtunnel#installation) and run:

```bash
lt --port 8080 --print-requests
```

localtunnel will print out an url (`https://<domain-name>.loca.lt`) that can be accessed from internet, e.g. `https://xxx.loca.lt`.

> Tip:
> There is one known issue that [localtunnel goes offline when the server restarts](https://github.com/localtunnel/localtunnel/issues/466) and [here is the workaround](https://github.com/localtunnel/localtunnel/issues/466#issuecomment-1030599216)  

There are also other tools to choose when debugging the webhook locally, for example, [ngrok](​https://ngrok.com/), [loophole](https://loophole.cloud/docs/), [TunnelRelay](https://github.com/OfficeDev/microsoft-teams-tunnelrelay) or so. Some tools might have issue returning response headers correctly. Try the following command to see if the tool is working properly:

```bash
curl https://<domain-name>.loca.lt/eventhandler -X OPTIONS -H "WebHook-Request-Origin: *" -H "ce-awpsversion: 1.0" --ssl-no-revoke -i
```

Check if the response header contains `webhook-allowed-origin: *`. This curl command actually checks if the WebHook [abuse protection request](https://docs.microsoft.com/azure/azure-web-pubsub/reference-cloud-events#webhook-validation) can response with the expected header.


## Configure the event handler

Go to the **Settings** tab to configure the event handler for this `sample_githubchat` hub:

1. Type the hub name (chat) and click "Add".

2. Set URL Pattern to `https://<domain-name>.loca.lt/eventhandler/{event}` and check `connected` in System Event Pattern, click "Save".

![Event Handler](../../images/portal_event_handler_githubchat.png)

## Start the chat

Open http://localhost:8080, input your user name, and send messages.

You can see in the localtunnel command window that there are requests coming in with every message sent from the page.
