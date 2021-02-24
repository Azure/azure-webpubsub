---
layout: docs
toc: true
group: specs
---

- [Abuse protection](#protection)
- [Web PubSub Service Atrribute Extension](#extension)
- [Events](#events)
    - [connect](#connect)
    - [connected](#connected)
    - [disconnected](#disconnected)
    - [For raw WebSocket clients](#simple)
        - [message](#message)
    - [For clients with webpubsub subprotocol](#subprotocol)
        - [Custom event](#custom_event)
        - [publish](#publish)
        - [published](#published)
        - [join](#join)
        - [joined](#joined)
        - [leave](#leave)
        - [left](#left)
         
## Event Handler HTTP Protocol Details

[CloudEvents](https://github.com/cloudevents/spec/blob/v1.0.1/spec.md) is a standardized and protocol-agnostic definition of the structure and metadata description of events. And we follow the [HTTP Protocol Binding for CloudEvents](https://github.com/cloudevents/spec/blob/v1.0.1/http-protocol-binding.md) to describe the messages for our event handlers.

The data sending from service to server is always in CloudEvents `binary` format.

### References
* [Current CloudEvents in use](https://github.com/cloudevents/spec/blob/v1.0/primer.md#existing-event-formats)

<a name="protection"></a>

### Abuse protection 
The Webhook abuse protection follows the same behavior as [CloudEvents](https://github.com/cloudevents/spec/blob/v1.0/http-webhook.md#4-abuse-protection).

`WebHook-Request-Origin: xxx.webpubsub.azure.com`
`WebHook-Request-Rate: 120` asks for permission to send 120 requests per minute.

If and only if the delivery target does allow delivery of the events, it MUST reply to the request by including the `WebHook-Allowed-Origin` and `WebHook-Allowed-Rate` headers.

For now , we do not support [WebHook-Request-Callback](https://github.com/cloudevents/spec/blob/v1.0/http-webhook.md#413-webhook-request-callback).

<a name="extension"></a>

### Web PubSub Service Atrribute Extension

> It was also noted that the HTTP specification is now following a similar pattern by no longer suggesting that extension HTTP headers be prefixed with X-.

This extension defines attributes used by Web PubSub Service for every event it produces.

#### Attributes

| Name | Type | Description | Example|
|--|--|--|--|
| `signature` | `string` | | `sha256={connection-id-hash-primary},sha256={connection-id-hash-secondary}`|
| `userId` | `string` | The user the connection authed | |
| `hub` | `string` | The hub the connection belongs to | |
| `connectionId` | `string` | The connectionId is unique for the client connection | |
| `eventName` | `string` | The name of the event without prefix | |

### Events

#### Connect

The `Data` payload contains the properties for the `connect` system event.

##### Examples
This example shows a typical connect event message:

`binary` format:

```HTTP
POST /upstream HTTP/1.1
Host: xxx.webpubsub.azure.com
Content-Type: application/json; charset=utf-8
Content-Length: nnnn
ce-specversion: 1.0
ce-type: azure.webpubsub.sys.connect
ce-source: /hubs/{hub}/client/{connectionId}
ce-id: {eventId}
ce-time: 2021-01-01T00:00:00Z
ce-signature: sha256={connection-id-hash-primary},sha256={connection-id-hash-secondary}
ce-userId: {userId}
ce-connectionId: {connectionId}
ce-hub: {hub}
ce-eventName: connect

{
    "claims": {},
    "query": {},
    "headers": {},
    "subprotocols": [],
    "clientCertificates": [
        {
            "thumbprint": "ABC"
        }
    ]
}

```

This example shows a response in `binary` format:

```HTTP
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Length: nnnn
ce-specversion: 1.0
ce-type: azure.webpubsub.sys.connect
ce-source: /hubs/{hub}/client/{connectionId}
ce-id: {eventId}
ce-time: 2021-01-01T00:00:00Z
ce-datacontenttype: application/json

{
    "groups": [],
    "userId": "",
    "roles": [],
    "subprotocol": "",
    "headers": {
    }
}

```

* `subprotocols`

    The `connect` event forwards the subprotocol and authentication information to Upstream from the client. The Azure SignalR Service uses the status code to determine if the request will be upgraded to WebSocket protocol.

    If the request contains the `subprotocols` property, the server should return one subprotocol it supports. If the server doesn't want to use any subprotocols, it should **not** send the `subprotocol` property in response. [Sending a blank header is invalid](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers#Subprotocols).

* `userId`: `{authed user id}`

    As the service allows anonymous connections, it is the `connect` event's responsibility to tell the service the user id of the client connection. The Service will read the user id from the response payload `userId` if it exists. The connection will be dropped if user id cannot be read from the request claims nor the `connect` event's response payload.

<a name="connect_response_header_group"></a>
 
* `groups`: `{groups to join}`

    The property provides a convenient way for user to add this connection to one or multiple groups. In this way, there is no need to have an additional call to add this connection to some group.

##### Response Status Codes:
* `2xx`: Success, the WebSocket connection is going to be established.
* `4xx`: Error, the response from Upstream will be returned as the response for the client request.

#### Client connected
The service calls the Upstram when the client completed WebSocket handshake and successfully connected.

##### Url Parameters:
* `event`: `connected`

##### Examples
This example shows a typical `connected` event message:

`binary` format:

```HTTP
POST /upstream HTTP/1.1
Host: xxx.webpubsub.azure.com
Content-Type: application/json; charset=utf-8
Content-Length: nnnn
ce-specversion: 1.0
ce-type: azure.webpubsub.sys.connected
ce-source: /hubs/{hub}/client/{connectionId}
ce-id: {eventId}
ce-time: 2021-01-01T00:00:00Z
ce-datacontenttype: application/json
ce-signature: sha256={connection-id-hash-primary},sha256={connection-id-hash-secondary}
ce-userId: {userId}
ce-connectionId: {connectionId}
ce-hub: {hub}
ce-eventName: connect

DATA:
{
}

```

This example shows a response in `binary` format:

```HTTP
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Length: nnnn
ce-specversion: 1.0
ce-type: azure.webpubsub.sys.connected
ce-source: /hubs/{hub}/client/{connectionId}
ce-id: {eventId}
ce-time: 2021-01-01T00:00:00Z

```

#### Client Disconnected

**Disconnected** event will **always** be triggered when the client request completes if the **connect** event returns `2xx` status code.

##### Url Parameters:
* `event`: `disconnected`

##### Examples
This example shows a typical `disconnect` event message:

`binary` format:

```HTTP
POST /upstream HTTP/1.1
Host: xxx.webpubsub.azure.com
Content-Type: application/json; charset=utf-8
Content-Length: nnnn
ce-specversion: 1.0
ce-type: azure.webpubsub.sys.disconnected
ce-source: /hubs/{hub}/client/{connectionId}
ce-id: {eventId}
ce-time: 2021-01-01T00:00:00Z
ce-signature: sha256={connection-id-hash-primary},sha256={connection-id-hash-secondary}
ce-userId: {userId}
ce-connectionId: {connectionId}
ce-hub: {hub}
ce-eventName: disconnect

{
    "reason": "{Reason}"
}

```

This example shows a response in `binary` format:

```HTTP
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Length: nnnn
ce-specversion: 1.0
ce-type: azure.webpubsub.sys.disconnected
ce-source: /hubs/{hub}/client/{connectionId}
ce-id: {eventId}
ce-time: 2021-01-01T00:00:00Z

```

* `reason`

    The `reason` describes the reason the client disconnects.

<a name="simple"></a>
### Events for the raw WebSocket clients
#### Send Messages
The service calls the Upstream for every complete WebSocket message.

##### Url Parameters:
* `event`: `message`

##### Examples
This example shows a typical `message` event message:

`binary` format:

```HTTP
POST /upstream HTTP/1.1
Host: xxx.webpubsub.azure.com
Content-Type: application/octet-stream (for binary frame) or text/plain (for text frame)
Content-Length: nnnn
ce-specversion: 1.0
ce-type: azure.webpubsub.user.message
ce-source: /hubs/{hub}/client/{connectionId}
ce-id: {eventId}
ce-time: 2021-01-01T00:00:00Z
ce-signature: sha256={connection-id-hash-primary},sha256={connection-id-hash-secondary}
ce-userId: {userId}
ce-connectionId: {connectionId}
ce-hub: {hub}
ce-eventName: message

UserPayload

```

This example shows a response in `binary` format:

```HTTP
HTTP/1.1 200 OK
Content-Type: application/octet-stream (for binary frame) or text/plain (for text frame)
Content-Length: nnnn
ce-specversion: 1.0
ce-type: azure.webpubsub.user.message
ce-source: /hubs/{hub}/client/{connectionId}
ce-id: {eventId}
ce-time: 2021-01-01T00:00:00Z

UserResponsePayload
```

<a name="subprotocol"></a>
### Events for clients with webpubsub subprotocol

<a name="custom_event"></a>

#### Send Custom event
The service calls the Upstream for every complete custom event message.

##### Url Parameters:
* `event`: `{event name specified}`

##### Examples
This example shows a typical event message:

`binary` format:

```HTTP
POST /upstream HTTP/1.1
Host: xxx.webpubsub.azure.com
Content-Type: application/octet-stream (for binary frame) or text/plain (for text frame)
Content-Length: nnnn
ce-specversion: 1.0
ce-type: azure.webpubsub.user.{customEventName}
ce-source: /hubs/{hub}/client/{connectionId}
ce-id: {eventId}
ce-time: 2021-01-01T00:00:00Z
ce-signature: sha256={connection-id-hash-primary},sha256={connection-id-hash-secondary}
ce-userId: {userId}
ce-connectionId: {connectionId}
ce-hub: {hub}
ce-eventName: {customEventName}

UserPayload

```

This example shows a response in `binary` format:

```HTTP
HTTP/1.1 200 OK
Content-Type: application/octet-stream (for binary frame) or text/plain (for text frame)
Content-Length: nnnn
ce-specversion: 1.0
ce-type: azure.webpubsub.user.{customEventName}
ce-source: /hubs/{hub}/client/{connectionId}
ce-id: {eventId}
ce-time: 2021-01-01T00:00:00Z

UserResponsePayload
```

#### Publish

##### Url Parameters:
* `event`: `publish`

##### Response Status Codes:
* `2xx`: Success, the WebSocket connection is going to be established.
* `4xx`: Error, the response from Upstream will be returned as the response for the client request.

##### Examples
This example shows a typical event message:

`binary` format:

```HTTP
POST /upstream HTTP/1.1
Host: xxx.webpubsub.azure.com
Content-Type: application/json
Content-Length: nnnn
ce-specversion: 1.0
ce-type: azure.webpubsub.sys.publish
ce-source: /hubs/{hub}/client/{connectionId}
ce-id: {eventId}
ce-time: 2021-01-01T00:00:00Z
ce-signature: sha256={connection-id-hash-primary},sha256={connection-id-hash-secondary}
ce-userId: {userId}
ce-connectionId: {connectionId}
ce-hub: {hub}
ce-eventName: publish

{
    "group": "{groupName}",
    "roles": [],
    "messageSize": 123,
}

```

This example shows a response in `binary` format:

Success response:
```HTTP
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: nnnn
ce-specversion: 1.0
ce-type: azure.webpubsub.sys.publish
ce-source: /hubs/{hub}/client/{connectionId}
ce-id: {eventId}
ce-time: 2021-01-01T00:00:00Z

{
}
```

Error response:

```HTTP
HTTP/1.1 401 Unauthorized
Content-Type: application/json
Content-Length: nnnn
ce-specversion: 1.0
ce-type: azure.webpubsub.sys.publish
ce-source: /hubs/{hub}/client/{connectionId}
ce-id: {eventId}
ce-time: 2021-01-01T00:00:00Z

{
    "error": "error detail",
    "action": "close|warn|ignore"
}
```