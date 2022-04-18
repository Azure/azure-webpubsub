# Yjs binding for Azure WebPubSub

## Introduction

- [Microsoft Azure Web PubSub](https://docs.microsoft.com/en-us/azure/azure-web-pubsub/overview) is a real-time messaging cloud service.

- [Yjs](https://github.com/yjs/yjs) is a [CRDT implementation](https://github.com/yjs/yjs#Yjs-CRDT-Algorithm) that exposes its internal data structure as shared types. Shared types are common data types like Map or Array with superpowers: changes are automatically distributed to other peers and merged without merge conflicts.

This package implements a classical client-server model, which helps developers use Microsoft Azure WebPub service to distribute changes without conflicts.

## Usage

### Server

1. Install required packages.

    ```bash
    npm install @azure/web-pubsub
    npm install y-azure-webpubsub
    ```

1. Create a host connection to handle conflicts and distribute changes.

    > Note that there is only 1 host connection is allowed for each topic.

    ```ts
    import { Doc } from "yjs"
    import { WebPubSubServiceClient } from "@azure/web-pubsub";
    import { WebPubSubSyncHost } from "y-azure-webpubsub";

    const client: WebPubSubServiceClient = new WebPubSubServiceClient(
      connectionString ?? "",
      "<hub name>"
    );

    // create a host connection for each topic.
    const topic = "<topic name>";
    const doc = new Doc();
    const host = new WebPubSubSyncHost(client, topic, doc);
    host.start();
    ```

### Client or Browser

1. Install required packages.

    ```bash
    npm install yjs y-azure-webpubsub
    ```

1. Create a client connection provider.

    ```ts
    import { Doc } from "yjs"
    import { WebPubSubSyncClient } from "y-azure-webpubsub"

    const topic = "<topic name>";
    const doc = new Doc();
    const client = new WebPubSubSyncClient(url, topic, doc);
    client.start();

    const text = doc.getText('your type')
    ```

1. Subscribe changes. See [Y.Text](https://docs.yjs.dev/api/shared-types/y.text) API for details.

    ```ts
    text.observe(e => { 
        // ... 
    })
    ```

1. Publish changes. See [Y.Text](https://docs.yjs.dev/api/shared-types/y.text) API for details.

    ```ts
    text.insert(...)
    text.delete(...)
    ```

## Example

Here is an example to build a collaborate code editor with [Monaco Editor](https://microsoft.github.io/monaco-editor/).

[Collaborate Code Editor](../../../samples/javascript/collaborate-code-editor/)