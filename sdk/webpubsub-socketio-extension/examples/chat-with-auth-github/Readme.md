# Create a Chat app

## Prerequisites

1. [Node.js](https://nodejs.org)
2. Create an Web PubSub For Socket.IO  resource

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
Copy **Connection String** from **Keys** tab of the Web PubSub For Socket.IO resource, and replace the `<connection-string>` below with the value of your **Connection String**.

Linux:

```bash
export WebPubSubConnectionString="<connection_string>"
export GitHubClientId="<client-id>"
export GitHubClientSecret="<client-secret>"
npm run start
```

Windows:

```cmd
SET WebPubSubConnectionString=<connection_string>
SET GitHubClientId=<client-id>
SET GitHubClientSecret=<client-secret>
npm run start
```

## Start the chat

Open http://localhost:3000, after authenticated by GibHub, you could start your chat with others with your GitHub username.