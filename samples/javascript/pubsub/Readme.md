# Publish and subscribe messages

## Prerequisites

1. [Node.js](https://nodejs.org)
2. Create an Azure Web PubSub resource

## Setup

```bash
npm install
```

## Start subscriber

Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, and replace the `<connection-string>` below with the value of your **Connection String**.

![Connection String](./../../../docs/images/portal_conn.png)

Linux:

```bash
export WebPubSubConnectionString="<connection_string>"
node subscribe
```

Windows:

```cmd
SET WebPubSubConnectionString=<connection_string>
node subscribe
```

The subscriber is then connected.

## Start publisher

Replace the `<connection-string>` below with the value of your **Connection String**:

Linux:

```bash
export WebPubSubConnectionString="<connection_string>"
node publish "Hello world"
```

Windows:

```cmd
SET WebPubSubConnectionString=<connection_string>
node publish "Hello world"
```

You can see that the client receives message `Hello world`.
