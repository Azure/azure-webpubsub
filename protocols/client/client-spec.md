## Table of Content

- [Web PubSub Client Spec](#web-pubsub-client-spec)
  - [1. Connection](#1-connection)
    - [1.1 Connect](#11-connect)
    - [1.2 Connected](#12-connected)
    - [1.3 Connection drop](#13-connection-drop)
    - [1.4 Connection recovery](#14-connection-recovery)
  - [2. Authentication](#2-authentication)
    - [2.1 Access token](#21-access-token)
    - [2.2 Reconnection token](#22-reconnection-token)
  - [3. Groups and messages](#3-groups-and-messages)
    - [3.1 Ack messages](#31-ack-messages)
    - [3.2 SequenceId](#32-sequenceid)
    - [3.3 Join group and leave group](#33-join-group-and-leave-group)
    - [3.4 Send group messages](#34-send-group-messages)
    - [3.5 Send event messages](#35-send-event-messages)
    - [3.6 Streaming](#36-streaming)
  - [4. Message Object Reference](#4-message-object-reference)
    - [json.reliable.webpubsub.azure.v1](#jsonreliablewebpubsubazurev1)
    - [protobuf.reliable.webpubsub.azure.v1](#protobufreliablewebpubsubazurev1)
    - [json.webpubsub.azure.v1](#jsonwebpubsubazurev1)
    - [protobuf.webpubsub.azure.v1](#protobufwebpubsubazurev1)
  - [5. Term definition](#5-term-definition)
    - [Callback function](#callback-function)
    - [Function name](#function-name)

#  Web PubSub Client Spec

This document outlines the complete feature set of the pub sub client of Azure Web PubSub Service. It is expected that every client library developer refers to this document to ensure that their client library provides the right behavior and features

The Web PubSub Service supports predefined subprotocols and custom subprotocols. The spec focus on predefined subprotocols and client libraries should mainly focus on implement features that predefined subprotocols support.

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC2119](https://datatracker.ietf.org/doc/html/rfc2119).

Although that protocol (subprotocols and the feature spec) is published, we reserve the right to change the protocol and drop support for superseded protocol versions at any time. Of course, we don’t want to make life difficult for client library developers, so any incompatible changes will be very carefully considered, but nonetheless developers must regard the protocol definition as being subject to change.

## 1. Connection

Connection connects to the Azure Web PubSub Service using a websocket connection. The connection is designed to  multiplex operations across different groups within one hub.

### 1.1 Connect

1. Client libraries SHOULD contain a `connect` function. It's used to explicitly connect to the Web PubSub Service if not already connected.

2. The host endpoint to connect is provided by Azure WebPubSub Service and the following path or query string should be used to open a new connection.
    1. Base URI is `wss://{host}/client`
    2. Either additional path `/hubs/{hub}` or query string `hub={hub}` MUST be used to indicate the hub to connect to.
    3. query string parameter `access_token` SHOULD contains the token string unless the hub supports anonymous websocket clients. See details in [Access token](#21-access-token)
    
A sample URI is `wss://{host}/client/hubs/{hub}?access_token={accessToken}`

3. The service supports various subprotocols, connection uses these subprotocols by setting the websocket [subprotocol](https://datatracker.ietf.org/doc/html/rfc6455#section-1.9). The service predefined the following subprotocols to provide more functionality:

    - Reliable subprotocols: `json.reliable.webpubsub.azure.v1`, `protobuf.reliable.webpubsub.azure.v1`
    - Non-reliable subprotocols: `json.webpubsub.azure.v1`, `protobuf.webpubsub.azure.v1`

4. If the websocket connection doesn't specify the subprotocol or specify non-predefined subprotocols. The connection will be a "simple websocket client". It's not the target of this spec or client libraries. See details in [The simple Websocket client](https://docs.microsoft.com/azure/azure-web-pubsub/concept-client-protocols#the-simple-websocket-client)

5. Client libraries are RECOMMENDED to implement reliable subprotocols as they have advantages over others on connection reliability and message delivery.

6. Connections can set more than one subprotocol, but in this case, an event handler MUST be configured to handle `connect` event and select one subprotocol from list. If there's no event handler in such case, unexpected behavior MAY occur in different languages.

7. Client libraries SHOULD provide [callback functions](#callback-function) on getting `access_token`. It's because of clients usually have there own logic to get access token, such as request from separate authentication server.

### 1.2 Connected

1. The client connection is considered connected once the websocket connection is open and the initial `ConnectedMessage` has been received.

2. The `ConnectedMessage` contains `connectionId` property, which SHOULD be recorded in local. The connectionId can be used in log or return to user for future usage.

3. For reliable subprotocols, the `ConnectedMessage` also contains `reconnectionToken` property. The token is crucial for connection recovery, and also MUST be recorded locally together with `connectionId`.

4. A client MAY receive `ConnectedMessage` after recovery. The client library SHOULD update local `reconnectionToken` after receiving `ConnectedMessage`. Client libraries MUST only trigger a `connected` [callback functions](#callback-function) when receives `ConnectedMessage` the first time after making a new connection. In particular, the library MUST NOT trigger `connected` [callback functions](#callback-function) after connection recovery. The `connected` [callback functions](#callback-function) is implemented by user to do some initialization work, such as joining groups.

### 1.3 Connection drop

Connections may drop after connection is connected:

1. The connection receives a `DisconnectedMessage` and then the transport will be closed. Client libraries SHOULD record property `message` in `DisconnectedMessage` as the reason of disconnection.

2. The transport is disconnected unexpectedly.

When connection drops, client libraries SHOULD mark all messages sent but not receive `AckMessage` as failed. If the connection is using non-reliable protocols, connection state will be removed from the service. The client library MAY support auto reconnecting by making a new connection. 

### 1.4 Connection recovery

Connection recovery is specific to reliable subprotocols. Client libraries SHOULD implement reliable subprotocols and make it as the default subprotocols to provide a high reliable experience.

After connection drop, the client library SHOULD attempt to recover the connection unless meets the sign to stop recovering. The Web PubSub Service will keep the connection state in service side for at least 30 seconds. And the service makes sure all group info that the connection joined will be retained and all messages not delivered will be queued.

In order to recovery the connection, the client library MUST:

1. Make new websocket connection to the host with the following query strings together with hub info:

    1. `awps_connection_id`: The `connectionId` received from `ConnectedMessage`.

    1. `awps_reconnection_token`: The `reconnectionToken` received from `ConnectedMessage`. See details in [Reconnection token](#22-reconnection-token)
    
    A sample URI will be `wss://{host}/client/hubs/{hub}?awps_connection_id={connectionId}&awps_reconnection_token={reconnectionToken}`

2. The service will response to the recovery request:

    1. The websocket connection connects. In this case, it means the recovery is success.

    2. Receive websocket closure with websocket status code 1008. In this case, the recovery is failed. Usually, it's because the connection expires the retain timeout. Or the service meets some unrecoverable errors. And the client library MUST make a new connection.
    
    3. Other cases like unexpected HTTP response with code like 502. In this case, it doesn't means the recovery will eventually fail. Client SHOULD keep making recover requests.

3. The client library MUST stop try recovering the connection, instead making a new connection when:

    1. The service respond with websocket status code 1008

    2. The recovery attempts last more than 30 seconds.

If the recovery failed, the client library MUST reset the local sequenceId and mark all messages sent but not receive `AckMessage` as failed. 

## 2. Authentication

### 2.1 Access token

1. The client uses JWT based authentication. When making a new connection, token MUST be in the query string parameter `access_token`.

2. The [`exp`](https://datatracker.ietf.org/doc/html/rfc7519#section-4.1.4) of the access token is only checked at the time you're making the new connection. In particular, the service won't terminate the connection if the access token expires after connection is connected.

### 2.2 Reconnection token

1. Reconnection token is for connection recovery. It's provided by the `reconnectionToken` property in `ConnectedMessage` and it's only available in reliable protocols.

2. Reconnection token has a long expire time (~ 1 week) and has a limited scope. It can be only used to recover the connection you've received `reconnectionToken` from.

## 3. Groups and messages

A group is a subset of connections to the hub. Client connections can join groups and send messages to groups. Group info is attached to a connection (identified by `connectionId`). That means the service won't save your group info and you SHOULD save group info in your business layer and join groups that the connection belongs to when a new connection is connected.

### 3.1 Ack messages

1. `JoinGroupMessage`, `LeaveGroupMessage`, `SendToGroupMessage` and `EventMessage` has `ackId` property. The `ackId` property is an optional property. Only when the `ackId` property is provided in message, the service will give an ack response. Otherwise, it's fire-and-forget. Even there're errors, you have no way to get notified. 

2. `ackId` is a uint64 number and should be unique within a client with the same connectionId. It's designed for idempotent publishing. The service records the ackId and messages with the same ackId will be treated as the same message. The service refuses to execute the same message more than once, which is useful in retry to avoid duplicated messages.

3. Client libraries that support reliable protocols MUST support ackId. And in this case, client libraries MUST provide a [callback functions](#callback-function) (or other language-idiomatic equivalent, such as async method in C#) to let user get the result of message execution. The service will respond with `AckMessage`, and the result will be one of the following:

    1. property `success` is true. In this case, the client library SHOULD invoke callback function with success result.
    
    2. property `success` is false. In this case, the client library SHOULD invoke callback function with error result in `error` property.

If the client library supports auto retry, it MUST NOT retry once `success` is false and `error.name` is `Duplicate`. In this case, the message with the same `ackId` has already been executed by the service.

4. Client libraries MAY support library-generated `ackId` function. In this case, client libraries can have a base id by random, and add incremental number to the base id for each message.

5. It's unnecessary to add timeout for every message. Instead the client library can rely on: the service will send an `AckMessage` or the websocket transport will fail. Once connection drop, the client SHOULD treat messages that not receive `AckMessage` as failed.

### 3.2 SequenceId

Once the client connection is using reliable subprotocols, many messages from the service will contains `sequenceId` property. If using non-reliable subprotocols, there's no `sequenceId` property in messages.

1. `sequenceId` is a non-zero uint64 incremental number within a connectionId and gives all messages sent to the client connection an order. Service use this `sequenceId` to get the knowledge of how many messages the client has been received. As the `sequenceId` is incremental and the transport layer guarantee the order, once the service has acknowledged the `sequenceId` `x` is received, the service can know all messages before `x` has been received.

2. Client libraries that support reliable protocols MUST handle `sequenceId` by sending a `SequenceAckMessage` to the service. As the service will queue all the message that not ack-ed, it has a capacity of 1000 messages or 16 MB. Once queued messages exceed the capacity, the service will close the connection and in this case, the connection is unrecoverable. Therefore, client libraries SHOULD respond `SequenceAckMessage` as soon as possible.

3. Client libraries SHOULD respond `SequenceAckMessage` once received the message rather than after processing the message. The `sequenceId` is only designed for acknowledging the client has received the message rather than having successfully processed the message. It's RECOMMENDED to transparently respond rather than having an explicit function to let user do it.

4. Client libraries SHOULD record the largest `sequenceId` ever received in messages in local and set `sequenceId` in `SequenceAckMessage` to this largest number. The service may send older queued message after recovery, responding with the largest `sequenceId` number can help the service to skip received messages.

5. Client libraries MAY support periodically respond the `SequenceAckMessage` to avoid responding for every received message. But the period SHOULD NOT be too long to cause the queue exceed the capacity.

### 3.3 Join group and leave group

1. Client libraries SHOULD have the `joinGroup` function, and `leaveGroup` function.

2. When `joinGroup` is called, a `JoinGroupMessage` is sent to the service and wait for the ack response. And when `leaveGroup` is called, a `LeaveGroupMessage` is sent to the service and wait for the ack response.

3. It's RECOMMENDED that `JoinGroupMessage` and `LeaveGroupMessage` always use idempotent publishing to get the result of execution. Client libraries SHOULD provide a [callback functions](#callback-function) (or other language-idiomatic equivalent) to get the result of join leave group operation.

### 3.4 Send group messages

1. Client libraries SHOULD have the `sendToGroup` function with fire-and-forget and idempotent publishing separately.

2. When `sendToGroup` is called, a `SendToGroupMessage` will be sent to the service. If the `ackId` property is set, means client expects the send result. If the client library supports reliable protocols, the function is REQUIRED. Client libraries SHOULD provide a [callback functions](#callback-function) (or other language-idiomatic equivalent) to get the result of broadcasting message.

### 3.5 Send event messages

1. Client libraries SHOULD have the `sendEvent` function with fire-and-forget and idempotent publishing separately.

2. When `sendToGroup` is called, a `EventMessage` will be sent to the service. If the `ackId` property is set, means client expects the send result. If the client library supports reliable protocols, the function is REQUIRED. Client libraries SHOULD provide a [callback functions](#callback-function) (or other language-idiomatic equivalent) to get the result of event message.

### 3.6 Streaming

Streaming is a client pub/sub feature that lets a publisher send one logical ordered stream as multiple websocket messages while receiving stream-level acknowledgements from the service. A stream is identified by `streamId` and ordered by `streamSequenceId`. Ordering is guaranteed within one `streamId`; different streams are independent from each other.

Client-originated streaming currently targets groups. Client libraries that support streaming MUST provide a function to create a stream to a group. The function name MAY vary by language convention.

#### 3.6.1 Stream start

1. A client MUST start a group stream by sending a `SendToGroupMessage` whose stream start metadata is set. The stream start message MUST include the target group and `streamId`. The exact wire format depends on the selected subprotocol and is defined by the corresponding subprotocol reference in [Message Object Reference](#4-message-object-reference).

2. The stream start message MUST NOT include `data` or `dataType`. The stream start message SHOULD NOT include `ackId`; stream lifecycle is acknowledged by streaming acknowledgement messages rather than `AckMessage`.

3. `stream.streamId` MUST be a non-empty string and MUST be unique among active streams on the same client connection. Client libraries are RECOMMENDED to use a globally unique value, such as a GUID/UUID, when generating `streamId`. After the stream is closed, the same `streamId` MAY be reused on the same client connection.

4. `stream.idleTimeoutMs` is OPTIONAL. If present, it MUST be greater than `0`. If omitted, the service default is `300000` milliseconds. The value is an idle timeout for the stream, not a total stream lifetime. It controls how long the stream can remain open without accepted stream activity, such as stream data or keepalive. Client libraries SHOULD send stream data, send keepalive, or close the stream before this timeout elapses when the application needs to keep the stream open. If the stream expires because of this timeout, the publisher receives `StreamClosedMessage` with error name `IdleTimeout`.

5. `noEcho` has the same semantics as `SendToGroupMessage`: when it is true, client libraries SHOULD NOT expect stream data or stream terminal messages to be delivered back to the publisher connection.

6. When the service accepts a stream start, it sends a `StreamAckMessage` with `expectedSequenceId` equal to `1`. Client libraries MUST treat this message as the signal that stream data can be sent for the stream.

7. If the service rejects the stream start because the stream is invalid, already exists, or the publisher is not authorized to send to the group, client libraries SHOULD surface the failure to the caller that creates the stream.

#### 3.6.2 Stream data and keepalive

1. After the stream is accepted, a client sends stream fragments using `StreamDataMessage`. The exact wire format depends on the selected subprotocol and is defined by the corresponding subprotocol reference in [Message Object Reference](#4-message-object-reference).

2. `streamId` MUST identify an active stream on the same client connection. If the service cannot find the stream, it responds with `StreamClosedMessage` whose error name is `StreamNotFound`. Client libraries MUST treat that response as terminal for the stream.

3. `streamSequenceId` MUST be a positive uint64 number. The first data fragment in a stream MUST use `streamSequenceId` `1`. Each following data fragment for the same `streamId` MUST increase `streamSequenceId` by exactly `1`.

4. A data fragment MUST include `streamSequenceId`, `dataType`, and `data`. Client libraries MUST NOT send a `StreamDataMessage` that includes any of these payload properties without the other required payload properties.

5. When the service accepts a data fragment whose `streamSequenceId` equals the next expected sequence id, the fragment is published to the target group and the next `StreamAckMessage` for the stream reports an advanced `expectedSequenceId`.

6. When the service receives a data fragment whose `streamSequenceId` is lower than the next expected sequence id, the fragment is treated as a duplicate and is not published again. Client libraries SHOULD be prepared to receive a `StreamAckMessage` that reports the current next expected sequence id.

7. When the service receives a data fragment whose `streamSequenceId` is higher than the next expected sequence id, the fragment is not published and the service responds with `StreamNackMessage` whose `name` is `InvalidSequenceId` and whose `expectedSequenceId` is the current next expected sequence id. Client libraries SHOULD use the reported `expectedSequenceId` to continue or replay the stream from the required fragment.

8. A `StreamDataMessage` that contains only the message type and `streamId` is a stream keepalive.

9. A keepalive message is not delivered to subscribers. The service uses accepted keepalive messages to keep the stream active. If the stream does not exist, the service responds with `StreamClosedMessage` whose error name is `StreamNotFound`. Client libraries MUST treat that response as terminal for the stream.

#### 3.6.3 Stream end

1. A client closes a stream by sending `StreamEndMessage`. The exact wire format depends on the selected subprotocol and is defined by the corresponding subprotocol reference in [Message Object Reference](#4-message-object-reference).

2. A client MAY close a stream with an application-defined error. The client-sent error object MAY contain `message` and `userErrorCode`; it MUST NOT contain `name`. The service classifies this terminal error as `UserError` when delivering it to subscribers.

3. `streamEnd` is not ordered by a client-supplied `streamSequenceId`. When the service accepts `streamEnd`, subscribers receive a terminal stream message with `stream.endOfStream` set to true and `stream.streamSequenceId` set to the next expected sequence id.

4. After the service accepts `streamEnd`, the publisher receives a `StreamClosedMessage` for the stream. If the stream is closed without an error, the `StreamClosedMessage` does not contain the `error` property. Client libraries MUST treat the `StreamClosedMessage` as terminal and MUST remove local state for that stream.

5. If the stream does not exist, the service responds with `StreamClosedMessage` whose error name is `StreamNotFound`. Client libraries MUST treat that response as terminal for the stream.

#### 3.6.4 Stream acknowledgements

1. A `StreamAckMessage` confirms that the service has accepted all stream fragments whose `streamSequenceId` is lower than `expectedSequenceId`. The exact wire format depends on the selected subprotocol and is defined by the corresponding subprotocol reference in [Message Object Reference](#4-message-object-reference).

2. `expectedSequenceId` is the next `streamSequenceId` the service expects for the stream. For example, `expectedSequenceId` `2` means the service has accepted fragment `1`.

3. The service can batch `StreamAckMessage` messages. Client libraries MUST NOT require an acknowledgement for every stream data fragment. For stream start, client libraries SHOULD wait for `StreamAckMessage` with `expectedSequenceId` `1` before sending stream data.

4. A `StreamNackMessage` reports a retriable stream error. The stream remains active unless a subsequent `StreamClosedMessage` is sent.

5. The `name` of `StreamNackMessage` MUST be one of `InvalidSequenceId` or `TransientError`. When a client library receives `StreamNackMessage`, it SHOULD use `expectedSequenceId` to keep or rewind its outbound stream buffer so unaccepted fragments can be sent again in order. Client libraries MUST NOT surface `StreamNackMessage` as a terminal stream error unless the stream buffer state is no longer valid.

6. A `StreamClosedMessage` reports terminal closure of the stream to the publisher.

7. If `StreamClosedMessage` does not contain `error`, the stream was closed normally. If `error` is present, `error.name` MUST be one of `StreamNotFound`, `Forbidden`, `BadRequest`, `InternalServerError`, or `IdleTimeout`. Client libraries MUST treat `StreamClosedMessage` as terminal and MUST remove local state for that stream.

#### 3.6.5 Stream receiver messages

1. Subscribers receive stream fragments as normal group messages with additional stream metadata. The exact wire format depends on the selected subprotocol and is defined by the corresponding subprotocol reference in [Message Object Reference](#4-message-object-reference).

2. For reliable subprotocols, the message MAY also contain the normal connection-scoped `sequenceId`. The connection-scoped `sequenceId` is independent from `stream.streamSequenceId` and MUST NOT be used as the stream sequence id.

3. A terminal stream message has `stream.endOfStream` set to true. It MAY carry an empty payload.

4. A terminal stream message MAY contain `stream.error`. When the publisher supplies an error in `streamEnd`, subscribers receive `stream.error.name` equal to `UserError` with the supplied `message` and `userErrorCode` if present.

5. Service-generated terminal errors use `stream.error.name` values such as `IdleTimeout`, `InternalServerError`, `Forbidden`, or `Cancelled`.

6. Client libraries SHOULD provide a dedicated stream receiving API that creates separate application handler state per `group` and `streamId`. If a client library also raises the normal group message callback for stream messages, it MUST preserve the `stream` metadata in that callback.

7. Client libraries SHOULD support an option to ignore a stream when the first observed fragment is not `streamSequenceId` `1`. This is useful when the application only wants to process streams from the beginning.

#### 3.6.6 Stream client behavior

1. Client libraries MUST keep outbound stream state until the stream receives a terminal `StreamClosedMessage` or the client library otherwise fails the stream.

2. Client libraries SHOULD keep unacknowledged outbound fragments in a per-stream buffer. When `StreamAckMessage.expectedSequenceId` advances, client libraries MAY remove buffered fragments whose `streamSequenceId` is lower than `expectedSequenceId`.

3. When a reliable connection drops and connection recovery starts, client libraries SHOULD pause outbound stream publishing. After recovery succeeds, client libraries SHOULD resume streams by sending buffered unacknowledged fragments in stream order. If recovery fails and a new connection is required, client libraries MUST fail all active outbound streams because stream state is scoped to the original client connection.

4. Client libraries SHOULD provide back-pressure when the per-stream outbound buffer grows beyond an implementation-defined limit. Client libraries SHOULD fail pending publish operations if the stream is closed, aborted, or cannot make progress within an implementation-defined timeout.

## 4. Message Object Reference

Different subprotocols have different format for message. Find the reference to messages format.

### json.reliable.webpubsub.azure.v1

- [ConnectedMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-reliable-webpubsub-subprotocol#connected)
- [DisconnectedMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-reliable-webpubsub-subprotocol#disconnected)
- [JoinGroupMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-reliable-webpubsub-subprotocol#join-groups)
- [LeaveGroupMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-reliable-webpubsub-subprotocol#leave-groups)
- [SendToGroupMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-reliable-webpubsub-subprotocol#publish-messages)
- [EventMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-reliable-webpubsub-subprotocol#send-custom-events)
- [AckMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-reliable-webpubsub-subprotocol#ack-response)
- [SequenceAckMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-reliable-webpubsub-subprotocol#sequence-ack)
- [StreamDataMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-reliable-webpubsub-subprotocol#send-streaming-data)
- [StreamEndMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-reliable-webpubsub-subprotocol#end-streaming-messages)
- [StreamAckMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-reliable-webpubsub-subprotocol#stream-ack-response)
- [StreamNackMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-reliable-webpubsub-subprotocol#stream-nack-response)
- [StreamClosedMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-reliable-webpubsub-subprotocol#stream-closed-response)

### protobuf.reliable.webpubsub.azure.v1

- [ConnectedMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-reliable-webpubsub-subprotocol#connected)
- [DisconnectedMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-reliable-webpubsub-subprotocol#disconnected)
- [JoinGroupMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-reliable-webpubsub-subprotocol#join-groups)
- [LeaveGroupMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-reliable-webpubsub-subprotocol#leave-groups)
- [SendToGroupMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-reliable-webpubsub-subprotocol#publish-messages)
- [EventMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-reliable-webpubsub-subprotocol#send-custom-events)
- [AckMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-reliable-webpubsub-subprotocol#ack-response)
- [SequenceAckMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-reliable-webpubsub-subprotocol#sequence-ack)
- [StreamDataMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-reliable-webpubsub-subprotocol#send-streaming-data)
- [StreamEndMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-reliable-webpubsub-subprotocol#end-streaming-messages)
- [StreamAckMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-reliable-webpubsub-subprotocol#stream-ack-response)
- [StreamNackMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-reliable-webpubsub-subprotocol#stream-nack-response)
- [StreamClosedMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-reliable-webpubsub-subprotocol#stream-closed-response)

### json.webpubsub.azure.v1

- [ConnectedMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-webpubsub-subprotocol#connected)
- [DisconnectedMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-webpubsub-subprotocol#disconnected)
- [JoinGroupMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-webpubsub-subprotocol#join-groups)
- [LeaveGroupMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-webpubsub-subprotocol#leave-groups)
- [SendToGroupMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-webpubsub-subprotocol#publish-messages)
- [EventMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-webpubsub-subprotocol#send-custom-events)
- [AckMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-webpubsub-subprotocol#ack-response)
- [StreamDataMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-webpubsub-subprotocol#send-streaming-data)
- [StreamEndMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-webpubsub-subprotocol#end-streaming-messages)
- [StreamAckMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-webpubsub-subprotocol#stream-ack-response)
- [StreamNackMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-webpubsub-subprotocol#stream-nack-response)
- [StreamClosedMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-json-webpubsub-subprotocol#stream-closed-response)

### protobuf.webpubsub.azure.v1

- [ConnectedMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-webpubsub-subprotocol#connected)
- [DisconnectedMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-webpubsub-subprotocol#disconnected)
- [JoinGroupMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-webpubsub-subprotocol#join-groups)
- [LeaveGroupMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-webpubsub-subprotocol#leave-groups)
- [SendToGroupMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-webpubsub-subprotocol#publish-messages)
- [EventMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-webpubsub-subprotocol#send-custom-events)
- [AckMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-webpubsub-subprotocol#ack-response)
- [StreamDataMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-webpubsub-subprotocol#send-streaming-data)
- [StreamEndMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-webpubsub-subprotocol#end-streaming-messages)
- [StreamAckMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-webpubsub-subprotocol#stream-ack-response)
- [StreamNackMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-webpubsub-subprotocol#stream-nack-response)
- [StreamClosedMessage](https://docs.microsoft.com/azure/azure-web-pubsub/reference-protobuf-webpubsub-subprotocol#stream-closed-response)

## 5. Term definition

### Callback function

Callback functions are denoted as (argName: Type, ...) -> ReturnType. And callback function are implemented by users, and invoke by client libraries. Client libraries use callback functions to get customer returned value or notify custom defined logic. 

Callback function is also one of the ways to achieve asynchronize. In different language, it can be implemented by language-idiomatic equivalent, such as [Task-based asynchronous pattern](/dotnet/standard/asynchronous-programming-patterns/task-based-asynchronous-pattern-tap) in C#.

### Function name

The function name, such as `connect`, `joinGroup` described in the spec is just an example of naming. Different languages should follow their language conventions.
