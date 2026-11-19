# Client pub-sub with `@azure/web-pubsub-client` and typescript

## Prerequisites

1. [Node.js](https://nodejs.org)
2. Create an Azure Web PubSub resource

## Overview

The sample demonstrate client pub-sub with `@azure/web-pubsub-client` library and typescript.

## Setup

Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, and open the `.env` file and replace the `"<ConnectionString>"` with the value of your **Connection String**.

![Connection String](./../../../docs/images/portal_conn.png)

1. Start Client subscriber

```bash
cd subscriber
npm install
npm run start
```

The preceding commands started a subscriber that subscribed to a group and print all message received from the group.

2. Start Client publisher

```bash
cd publisher
npm install
npm run start
```

The preceding commands started a publisher and you can type messages and press Enter to send. Then you can see these messages are transferred to the client subscriber in real-time.