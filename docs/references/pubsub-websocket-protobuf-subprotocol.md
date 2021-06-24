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

All request messages follow the following protobuf format.

```protobuf
syntax = "proto3";

import "google/protobuf/any.proto";

message RequestMessage {
    oneof message {
        JoinGroupMessage join_group_message = 1;
        LeaveGroupMessage leave_group_message = 2;
        SendToGroupMessage send_to_group_message = 3;
        EventMessage event_message = 4;
    }
    
    message JoinGroupMessage {
        string group = 1;
        optional int32 ack_id = 2;
    }

    message LeaveGroupMessage {
        string group = 1;
        optional int32 ack_id = 2;
    }

    message SendToGroupMessage {
        string group = 1;
        optional int32 ack_id = 2;
        oneof data_type {
            string text_data = 3;
            bytes binary_data = 4;
            google.protobuf.Any protobuf_data = 5;
        }
    }

    message EventMessage {
        string event = 1;
        oneof data_type {
            string text_data = 3;
            bytes binary_data = 4;
            google.protobuf.Any protobuf_data = 5;
        }
    }
}
```

<a name="join"></a>


#### Join Group

* Set `join_group_message.group` to the group name.

* `ackId` is optional, it is an incremental integer for this command message. When the `ackId` is specified, the service sends a [ack response message](#ack) back to the client when the command is executed.

<a name="leave"></a>

#### Leave Group

 Set `leave_group_message.group` to the group name.

* `ackId` is optional, it is an incremental integer for this command message. When the `ackId` is specified, the service sends a [ack response message](#ack) back to the client when the command is executed.

<a name="publish"></a>

#### Publish Messages

* `ackId` is optional, it is an incremental integer for this command message. When the `ackId` is specified, the service sends a [ack response message](#ack) back to the client when the command is executed.

There's a implicit `dataType` which can be one of `protobuf`, `text`, or `binary`, base on the dataType you set. The receiver clients can leverage the `dataType` to handle the content correctly.

* `protobuf`: If you set `send_to_group_message.protobuf_data`, the implicit is `protobuf`. `send_to_group_message.protobuf_data` can be any supported protobuf type. All other clients will receive protobuf encoded binary which can be deserialized by any protobuf SDK. In clients that only support text based content(`json.webpubsub.azure.v1`), they will receive base64 encoded binary;

* `text`: If you set `send_to_group_message.text_data`, the implicit is `text`. `send_to_group_message.text_data` should be a string. All clients with other protocol will receive a UTF-8 encoded string;

* `binary`: If you set `send_to_group_message.binary_data`, the implicit is `binary`. `send_to_group_message.binary_data` should be a byte array. All clients with other protocol will receive a raw binary without protobuf encoded. In clients that only support text based content(`json.webpubsub.azure.v1`), they will receive base64 encoded binary;

##### Case 1: publish text data:

Set `send_to_group_message.group` to `group` and `send_to_group_message.text_data` to `"text data"`.

* what protobuf subprotocol client in this group `group` receives the binary frame and can use the [response](#responses) proto to deserialize.

* What json subprotocol client in this group `group` receives:

    ```json
    {
        "type": "message",
        "from": "group",
        "group": "group",
        "dataType" : "text",
        "data" : "text data"
    }
    ```

* What the raw client in this group `group` receives is string data `text data`.

##### Case 2: publish protobuf data:

Assume you have a customer message:

```
message MyMessage {
    int32 value = 1;
}
```

Set `send_to_group_message.group` to `group` and `send_to_group_message.protobuf_data` to `MyMessage` with `value = 1`

* what protobuf subprotocol client in this group `group` receives the binary frame and can use the [response](#responses) proto to deserialize.

* What subprotocol client in this group `group` receives:

    ```json
    {
        "type": "message",
        "from": "group",
        "group": "G",
        "dataType" : "protobuf",
        "data" : "CAE=" // Base64 encoded [8,1]
    }
    ```

    Note the data is a base64 encoded deserializeable protobuf binary. You can use the following proto to deserialize it:

    ```protobuf
    syntax = "proto3";
    
    message MyMessage {
        int32 value = 1;
    }
    ```

* What the raw client in this group `group` receives is the binary frame.

    ```
    # Show in Hex
    08 01
    ```

##### Case 3: publish binary data:

Set `send_to_group_message.group` to `group` and `send_to_group_message.binary_data` to `[1, 2, 3]`.

* what protobuf subprotocol client in this group `group` receives the binary frame and can use the [response](#responses) proto to deserialize.

* What json subprotocol client in this group `group` receives:

    ```json
    {
        "type": "message",
        "from": "group",
        "group": "group",
        "dataType" : "binary",
        "data" : "AQID", // Base64 encoded [1,2,3]
    }
    ```

    As json subprotocol client only support text based message, binary always encode with base64.

* What the raw client in this group `group` receives is the **binary** data in the binary frame.

    ```
    # Show in Hex
    01 02 03
    ```

<a name="events"></a>

#### Send Custom Events

There's a implicit `dataType` which can be one of `protobuf`, `text`, or `binary`, base on the dataType you set. The receiver clients can leverage the `dataType` to handle the content correctly.

* `protobuf`: If you set `send_to_group_message.protobuf_data`, the implicit is `protobuf`. `send_to_group_message.protobuf_data` can be any supported protobuf type. Event handler will receive protobuf encoded binary which can be deserialized by any protobuf SDK.

* `text`: If you set `send_to_group_message.text_data`, the implicit is `text`. `send_to_group_message.text_data` should be a string. Event handler will receive a UTF-8 encoded string;

* `binary`: If you set `send_to_group_message.binary_data`, the implicit is `binary`. `send_to_group_message.binary_data` should be a byte array. Event handler will receive raw binary frame

##### Case 1: send event with text data:

Set `event_message.text_data` to `"text data"`.

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

Assume you have a customer message:

```
message MyMessage {
    int32 value = 1;
}
```

Set `event_message.protobuf_data` to `MyMessage` with `value = 1`

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

08 01 // Just show in hex, you need to read as binary
```

The data is a valid protobuf binary. You can use the following proto to deserialize it:

```protobuf
syntax = "proto3";

message MyMessage {
    int32 value = 1;
}
```

##### Case 3: send event with binary data:

Set `send_to_group_message.binary_data` to `[1, 2, 3]`.

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

All response message follow the following protobuf format:

```
message ResponseMessage {
    oneof message {
        AckResponseMessage ack_response_message = 1;
        MessageResponseMessage message_response_message = 2;
        ConnectedMessage connected_message = 3;
        DisconnectedMessage disconnected_message = 4;
    }
    
    message AckResponseMessage {
        int32 ack_id = 1;
        bool success = 2;
        optional ErrorMessage error = 3;
    
        message ErrorMessage {
            string name = 1;
            string message = 2;
        }
    }

    message MessageResponseMessage {
        string from = 1;
        optional string group = 2;
        oneof data_type {
            string text_data = 3;
            bytes binary_data = 4;
            google.protobuf.Any protobuf_data = 5;
        }
    }

    message ConnectedMessage {
        string event = 1;
        string user_id = 2;
        string connection_id = 3;
    }

    message DisconnectedMessage {
        string event = 1;
        string message = 2;
    }
}
```

Messages received by the client can be several types: `ack`, `message`, and `system`: 

<a name="ack"></a>

#### Ack response

If the request contains `ackId`, the service will return an ack response for this request. The client implementation should handle this ack mechanism, including waiting for the ack response for an `async` `await` operation, and having a timeout check when the ack response is not received during a certain period.

The client implementation should always first check if the `success` is `true` or `false`. Only when `success` is `false` should the client reads from `error`.

<a name="message"></a>

#### Message response

Clients can receive messages published from one group the client joined, or from the server management role that the server sends messages to the specific client or the specific user.

* For the message is from a group, `from` will be `group`. When The message is from the server, `from` will be `server`

* When the message is from a group, `group` will be the group name.

* The sender's `dateType` will cause in one of the message being set. If `dateType` is `text`, you should use `message_response_message.text_data`. If `dateType` is `binary`, you should use `message_response_message.binary_data`. If `dateType` is `protobuf`, you should use `message_response_message.protobuf_data`. If `dateType` is `json`, you should use `message_response_message.text_data` and the content is serialized json string.

<a name="system"></a>

#### System response

The Web PubSub service can also send system-related responses to the client. 

##### Connected

When the connection connects to service.

##### Disconnected

When the server closes the connection, or when the service declines the client.
