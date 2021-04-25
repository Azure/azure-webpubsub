# Publish and subscribe messages

## Prerequisites

1. [Node.js](https://nodejs.org)
2. Create an Azure Web PubSub resource

## Setup

```bash
npm install
```

## Start subscriber

Copy **Connection String** from **Keys** blade of the created Azure Web PubSub service, and replace the `<connection-string>` below with the value of your **Connection String**.

![Connection String](./../../../docs/images/portal_conn.png)

```bash
node subscribe <connection-string> pubsub
```

The subscriber is then connected.

## Start publisher

Replace the `<connection-string>` below with the value of your **Connection String**:

```bash
node publish <connection-string> pubsub Hello,world
```

You can see that the client receives message `Hello,world`.
