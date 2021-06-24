---
layout: docs
toc: true
group: references
---
     
## Protobuf PubSub WebSocket Subprotocol

This document describes the subprotocol `protobuf.webpubsub.azure.v1`.

When the client is using this subprotocol, both outgoing data frame and incoming data frame are expected to be **protobuf** payloads.

- [Overview](#overview)
- [Permissions](#permissions)
- [Requests](#requests)
    - [Join Group Request](#join)
    - [Leave Group Request](#leave)
    - [Publish to Group Request](#publish)
    - [Send Events Request](#events)
- [Responses](#responses)
    - [Ack Response](#ack)
    - [Message Response](#message)
    - [System Response](#system)

### Overview

Subprotocol `protobuf.webpubsub.azure.v1` empowers the clients to do publish/subscribe directly instead of a round trip to the upstream server. We call the WebSocket connection with `protobuf.webpubsub.azure.v1` subprotocol a Protobuf PubSub WebSocket client.

For example, in JS, a PubSub WebSocket client can be created using:
```js
// Protobuf PubSub WebSocket client
var pubsub = new WebSocket('wss://test.webpubsub.azure.com/client/hubs/hub1', 'protobuf.webpubsub.azure.v1');
```
For a simple WebSocket client, the *server* is a MUST HAVE role to handle the events from clients. A simple WebSocket connection always triggers a `message` event when it sends messages, and always relies on the server-side to process messages and do other operations. With the help of the `protobuf.webpubsub.azure.v1` subprotocol, an authorized client can join a group using [join requests](#join) and publish messages to a group using [publish requests](#publish) directly. It can also route messages to different upstreams (event handlers) by customizing the *event* the message belongs using [event requests](#events).

Currently, WebPubSub Service only support [proto3](https://developers.google.com/protocol-buffers/docs/proto3).

### Permissions

As you may have noticed when we describe the PubSub WebSocket clients, that a client can publish to other clients only when it is *authorized* to. The `role`s of the client determines the *initial* permissions the client have:

| Role | Permission |
|---|---|
| Not specified | The client can send event requests.
| `webpubsub.joinLeaveGroup` | The client can join/leave any group.
| `webpubsub.sendToGroup` | The client can publish messages to any group.
| `webpubsub.joinLeaveGroup.<group>` | The client can join/leave group `<group>`.
| `webpubsub.sendToGroup.<group>` | The client can publish messages to group `<group>`.

The server-side can also grant or revoke permissions of the client dynamically through REST APIs or server SDKs.

### Requests

<a name="join"></a>

#### Join Group

Format:

```protobuf
syntax = "proto3";

message JoinGroupMessage {
    string type = 1; // Assign to `joinGroup`
    string group = 2;
    optional int32 ackId = 3;
}
```

* `ackId` is optional, it is an incremental integer for this command message. When the `ackId` is specified, the service sends a [ack response message](#ack) back to the client when the command is executed.

<a name="leave"></a>

#### Leave Group


Format:

```protobuf
syntax = "proto3";

message LeaveGroupMessage {
    string type = 1; // Assign to `leaveGroup`
    string group = 2;
    optional int32 ackId = 3;
}
```

* `ackId` is optional, it is an incremental integer for this command message. When the `ackId` is specified, the service sends a [ack response message](#ack) back to the client when the command is executed.

<a name="publish"></a>

#### Publish Messages

Format:

```protobuf
syntax = "proto3";

message SendToGroupMessage {
    string type = 1; // Assign to `sendToGroup`
    string group = 2;
    optional int32 ackId = 3;
    optional string dataType = 4;
    <AnyType> data = 5; <AnyType> can be any supported type, including scalar value type or custom defined type.
}
```

* `ackId` is optional, it is an incremental integer for this command message. When the `ackId` is specified, the service sends a [ack response message](#ack) back to the client when the command is executed.

`dataType` can be one of `protobuf`, `text`, or `binary`:

* `protobuf`: `data` can be any supported protobuf type. All other clients will receive protobuf encoded binary which can be deserialized by any protobuf SDK. In clients that only support text based content(`json.webpubsub.azure.v1`), they will receive base64 encoded binary;

* `text`: `data` should be in scalar type: string. All clients with other protocol will receive a UTF-8 encoded string;

* `binary`: `data` should be in scalar type: bytes. All clients with other protocol will receive a raw binary without protobuf encoding. In clients that only support text based content(`json.webpubsub.azure.v1`), they will receive base64 encoded binary;

##### Case 1: publish text data:

Set `data = "text data"`, `dataType = "text"` and use the following proto.

```protobuf
syntax = "proto3";

message SendToGroupMessage {
    string type = 1;
    string group = 2;
    optional int32 ackId = 3;
    optional string dataType = 4;
    string data = 5;
}
```

* what protobuf subprotocol client in this group `G` receives the binary frame:

```
# Show in Hex
0A 07 6D 65 73 73 61 67 65 12 05 67 72 6F 75 70 1A 01 47 22 04 74 65 78 74 2A 09 74 65 78 74 20 64 61 74 61
```

* What json subprotocol client in this group `G` receives:

```json
{
    "type": "message",
    "from": "group",
    "group": "G",
    "dataType" : "text",
    "data" : "text data"
}
```

* What the raw client in this group `G` receives is string data `text data`.

##### Case 2: publish protobuf data:

Set `data.value = 1`, `dataType = "protobuf"` and use the following proto.

```protobuf
syntax = "proto3";

message SendToGroupMessage {
    string type = 1;
    string group = 2;
    optional int32 ackId = 3;
    optional string dataType = 4;
    MyData data = 5;

    message MyData {
        int32 value = 1;
    }
}
```

* what protobuf subprotocol client in this group `G` receives the binary frame:

```
# Show in Hex
0A 07 6D 65 73 73 61 67 65 12 05 67 72 6F 75 70 1A 01 47 22 08 70 72 6F 74 6F 62 75 66 2A 02 08 01
```

* What subprotocol client in this group `G` receives:
```json
{
    "type": "message",
    "from": "group",
    "group": "G",
    "dataType" : "protobuf",
    "data" : "KgIIAQ==" //Base64 encoded [42,2,8,1]
}
```
Note the data is a base64 encoded deserializeable protobuf binary. You can use the following proto to deserialize it:

```protobuf
syntax = "proto3";

message ResponseMessage {
    MyData data = 5;

    message MyData {
        int32 value = 1;
    }
}
```

* What the raw client in this group `G` receives is the binary frame.

```
# Show in Hex
2A 02 08 01
```

##### Case 3: publish binary data:
Set `data = byte[] {1, 2, 3}`, `dataType = "binary"` and use the following proto.

```protobuf
syntax = "proto3";

message SendToGroupMessage {
    string type = 1;
    string group = 2;
    optional int32 ackId = 3;
    optional string dataType = 4;
    bytes data = 5;
}
```

* what protobuf protobuf subprotocol client in this group `G` receives the binary frame:

```
# Show in Hex
0A 07 6D 65 73 73 61 67 65 12 05 67 72 6F 75 70 1A 01 47 22 06 62 69 6E 61 72 79 2A 03 01 02 03
```

* What json subprotocol client in this group `G` receives:
```json
{
    "type": "message",
    "from": "group",
    "group": "G",
    "dataType" : "binary",
    "data" : "AQID", // Base64 encoded [1,2,3]
}
```
As json subprotocol client only support text based message, binary always encode with base64.

* What the raw client in this group `G` receives is the **binary** data in the binary frame.

```
# Show in Hex
01 02 03
```

<a name="events"></a>

#### Send Custom Events

Format:

```protobuf
syntax = "proto3";

message EventMessage {
    string type = 1;
    string group = 2;
    optional string dataType = 4;
    <AnyType> data = 5;
}
```

`dataType` can be one of `protobuf`, `text`, or `binary`:

* `protobuf`: `data` can be any supported protobuf type. Event handler will receive protobuf encoded binary which can be deserialized by any protobuf SDK.

* `text`: `data` should be in scalar type: string. Event handler will receive a UTF-8 encoded string;

* `binary`: `data` should be in scalar type: bytes. Event handler will receive raw binary frame

##### Case 1: send event with text data:

Set `data = "text data"`, `dataType = "text"` and use the following proto.

```protobuf
syntax = "proto3";

message SendToGroupMessage {
    string type = 1;
    string group = 2;
    optional int32 ackId = 3;
    optional string dataType = 4;
    string data = 5;
}
```

What the upstream event handler receives like below, please note that the `Content-Type` for the CloudEvents HTTP request is `text/plain` for `dataType`=`text`

```HTTP
POST /upstream HTTP/1.1
Host: xxxxxx
WebHook-Request-Origin: xxx.webpubsub.azure.com
Content-Type: text/plain
Content-Length: nnnn
ce-specversion: 1.0
ce-type: azure.webpubsub.user.<event_name>
ce-source: /client/{connectionId}
ce-id: {eventId}
ce-time: 2021-01-01T00:00:00Z
ce-signature: sha256={connection-id-hash-primary},sha256={connection-id-hash-secondary}
ce-userId: {userId}
ce-connectionId: {connectionId}
ce-hub: {hub_name}
ce-eventName: <event_name>

text data

```

##### Case 2: send event with protobuf data:
Set `data.value = 1`, `dataType = "protobuf"` and use the following proto.

```protobuf
syntax = "proto3";

message SendToGroupMessage {
    string type = 1;
    string group = 2;
    optional int32 ackId = 3;
    optional string dataType = 4;
    MyData data = 5;

    message MyData {
        int32 value = 1;
    }
}
```

What the upstream event handler receives like below, please note that the `Content-Type` for the CloudEvents HTTP request is `application/x-protobuf` for `dataType`=`protobuf`

```HTTP
POST /upstream HTTP/1.1
Host: xxxxxx
WebHook-Request-Origin: xxx.webpubsub.azure.com
Content-Type: application/x-protobuf
Content-Length: nnnn
ce-specversion: 1.0
ce-type: azure.webpubsub.user.<event_name>
ce-source: /client/{connectionId}
ce-id: {eventId}
ce-time: 2021-01-01T00:00:00Z
ce-signature: sha256={connection-id-hash-primary},sha256={connection-id-hash-secondary}
ce-userId: {userId}
ce-connectionId: {connectionId}
ce-hub: {hub_name}
ce-eventName: <event_name>

2A 02 08 01 // Just show in hex, you need to read as binary
```

The data is a valid protobuf binary. You can use the following proto to deserialize it:

```protobuf
syntax = "proto3";

message ResponseMessage {
    MyData data = 5;

    message MyData {
        int32 value = 1;
    }
}
```


##### Case 3: send event with binary data:
Set `data = byte[] {1, 2, 3}`, `dataType = "binary"` and use the following proto.

```protobuf
syntax = "proto3";

message SendToGroupMessage {
    string type = 1;
    string group = 2;
    optional int32 ackId = 3;
    optional string dataType = 4;
    bytes data = 5;
}
```

What the upstream event handler receives like below, please note that the `Content-Type` for the CloudEvents HTTP request is `application/octet-stream` for `dataType`=`binary`

```HTTP
POST /upstream HTTP/1.1
Host: xxxxxx
WebHook-Request-Origin: xxx.webpubsub.azure.com
Content-Type: application/octet-stream
Content-Length: nnnn
ce-specversion: 1.0
ce-type: azure.webpubsub.user.<event_name>
ce-source: /client/{connectionId}
ce-id: {eventId}
ce-time: 2021-01-01T00:00:00Z
ce-signature: sha256={connection-id-hash-primary},sha256={connection-id-hash-secondary}
ce-userId: {userId}
ce-connectionId: {connectionId}
ce-hub: {hub_name}
ce-eventName: <event_name>

01 02 03 // Just show in hex, you need to read as binary

```

The WebSocket frame can be `text` format for text message frames or UTF8 encoded binaries for `binary` message frames.

Service declines the client if the message does not match the described format.

### Responses


Messages received by the client can be several types: `ack`, `message`, and `system`: 

<a name="ack"></a>

#### Ack response

If the request contains `ackId`, the service will return an ack response for this request. The client implementation should handle this ack mechanism, including waiting for the ack response for an `async` `await` operation, and having a timeout check when the ack response is not received during a certain period.

Format:

```
syntax = "proto3";

message AckMessage {
    string type = 1;
    int32 ackId = 2;
    bool success = 3;
    optional ErrorMessage error = 4
    
    message ErrorMessage {
        string name = 1;
        string message = 2;
    }
}
```

The client implementation should always first check if the `success` is `true` or `false`. Only when `success` is `false` should the client reads from `error`.

<a name="message"></a>

#### Message response

Clients can receive messages published from one group the client joined, or from the server management role that the server sends messages to the specific client or the specific user.

```protobuf
syntax = "proto3";

message ResponseMessage {
    string type = 1;
    string from = 2;
    optional string group = 3;
    string dateType = 4;
    <AnyType> data = 5
}
```

* `type` will be `message`

* For the message is from a group, `from` will be `group`. When The message is from the server, `from` will be `server`

* When the message is from a group, `group` will be the group name.

* `dateType` based on sender's date type.

* If `dateType` is `text`, you should use `string data = 5`. If `dateType` is `binary`, you should use `bytes data = 5`. If `dateType` is `protobuf`, you can use any type and just keep consistent with sender. If `dateType` is `json`, you should use `string data = 5` and the content is serialized json string.

<a name="system"></a>

#### System response

The Web PubSub service can also send system-related responses to the client. 

##### Connected

When the connection connects to service.

```protobuf
syntax = "proto3";

message ConnectedMessage {
    string type = 1;
    string event = 2;
    string userId = 3;
    string connectionId = 4;
}
```

##### Disconnected

When the server closes the connection, or when the service declines the client.

```protobuf
syntax = "proto3";

message ConnectedMessage {
    string type = 1;
    string event = 2;
    string message = 3;
}
```
