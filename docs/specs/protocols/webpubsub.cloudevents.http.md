---
layout: docs
toc: true
---
           
## Event Handler HTTP Protocol Details

[CloudEvents](https://github.com/cloudevents/spec/blob/v1.0.1/spec.md) is a standardized and protocol-agnostic definition of the structure and metadata description of events. And we follow the [HTTP Protocol Binding for CloudEvents](https://github.com/cloudevents/spec/blob/v1.0.1/http-protocol-binding.md) to describe the messages for our event handlers.

### References
* [Current CloudEvents in use](https://github.com/cloudevents/spec/blob/v1.0/primer.md#existing-event-formats)


### Abuse protection 
The Webhook abuse protection follows the same behavior as [CloudEvents](https://github.com/cloudevents/spec/blob/v1.0/http-webhook.md#4-abuse-protection).

`WebHook-Request-Origin: xxx.webpubsub.azure.com`
`WebHook-Request-Rate: 120` asks for permission to send 120 requests per minute.

If and only if the delivery target does allow delivery of the events, it MUST reply to the request by including the `WebHook-Allowed-Origin` and `WebHook-Allowed-Rate` headers.

For now , we do not support [WebHook-Request-Callback](https://github.com/cloudevents/spec/blob/v1.0/http-webhook.md#413-webhook-request-callback).


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

### Connect

The `Data` payload contains the properties for the `connect` system event.

#### Examples
This example shows a typical connect event message:

`structured` format:

```json
POST /upstream HTTP/1.1
Host: xxx.webpubsub.azure.com
Content-Type: application/cloudevents+json; charset=utf-8
Content-Length: nnnn
{
    "specversion" : "1.0",
    "type" : "azure.webpubsub.sys.connect",
    "source" : "/hubs/{hub}/client/{connectionId}",
    "id" : "{eventId}",
    "time": "2021-01-01T00:00:00Z",
    "datacontenttype" : "application/json",
    "signature": "sha256={connection-id-hash-primary},sha256={connection-id-hash-secondary}",
    "userId": "{userId}",
    "connectionId": "{connectionId}",
    "hub": "{hub}",
    "eventName": "connect",
    "data" : {
        "claims": {},
        "queries": {},
        "subprotocols": [],
        "clientCertificates": [
            {
                "thumbprint": "ABC"
            }
        ]
    }
}

```

`binary` format:

```json
POST /upstream HTTP/1.1
Host: xxx.webpubsub.azure.com
Content-Type: application/json; charset=utf-8
Content-Length: nnnn
ce-specversion: 1.0
ce-type: azure.webpubsub.sys.connect
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
    "claims": {},
    "query": {},
    "subprotocols": [],
    "clientCertificates": [
        {
            "thumbprint": "ABC"
        }
    ]
}

```

This example shows a response in `structured` format:

```JSON
HTTP/1.1 200 OK
Content-Type: application/cloudevents+json; charset=utf-8
Content-Length: nnnn
{
    "specversion" : "1.0",
    "type" : "azure.webpubsub.sys.connect",
    "source" : "/hubs/{hub}/client/{connectionId}",
    "connectionId": "{connectionId}",
    "id" : "{eventId}",
    "time": "2021-01-01T00:00:00Z",
    "datacontenttype" : "application/json",
    "data" : {
        "groups": [],
        "userId": "",
        "roles": [],
        "subprotocol": "",
        "headers": {
        }
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

#### Response Status Codes:
* `2xx`: Success, the WebSocket connection is going to be established.
* `4xx`: Error, the response from Upstream will be returned as the response for the client request.

### Send Messages
The service calls the Upstream for every complete WebSocket message.

#### Url Parameters:
* `event`: `send`

#### Examples
This example shows a typical connect event message:

`structured` format:
```JSON
POST /upstream HTTP/1.1
Host: xxx.webpubsub.azure.com
Content-Type: application/cloudevents+json; charset=utf-8
Content-Length: nnnn
{
    "specversion" : "1.0",
    "type" : "azure.webpubsub.user.send",
    "source" : "/hubs/{hub}/client/{connectionId}",
    "id" : "{eventId}",
    "time": "2021-01-01T00:00:00Z",
    "datacontenttype" : "application/json",
    "signature": "sha256={connection-id-hash-primary},sha256={connection-id-hash-secondary}",
    "userId": "{userId}",
    "connectionId": "{connectionId}",
    "hub": "{hub}",
    "eventName": "send",
    "datacontenttype" : "`application/octet-stream`(for binary frame)|`text/plain`(for text frame)",
    "data" : "{User Payload}"
}

```

This example shows a response in `structured` format:

```JSON
HTTP/1.1 200 OK
Content-Type: application/cloudevents+json; charset=utf-8
Content-Length: nnnn
{
    "specversion" : "1.0",
    "type" : "azure.webpubsub.user.send",
    "source" : "/hubs/{hub}/client/{connectionId}",
    "id" : "{eventId}",
    "time": "2021-01-01T00:00:00Z",
    "connectionId": "{connectionId}",
    "datacontenttype" : "`application/octet-stream`(for binary frame)|`text/plain`(for text frame)",
    "data" : "{User Payload}"
}

```


### Disconnect

**Disconnect** event will **always** be triggered when the client request completes if the **Connect** event returns `2xx` status code.

#### Url Parameters:
* `event`: `disconnect`

#### Examples
This example shows a typical connect event message:

`structured` format:
```JSON
POST /upstream HTTP/1.1
Host: xxx.webpubsub.azure.com
Content-Type: application/cloudevents+json; charset=utf-8
Content-Length: nnnn
{
    "specversion" : "1.0",
    "type" : "azure.webpubsub.sys.disconnect",
    "source" : "/hubs/{hub}/client/{connectionId}",
    "id" : "{eventId}",
    "time": "2021-01-01T00:00:00Z",
    "datacontenttype" : "application/json",
    "signature": "sha256={connection-id-hash-primary},sha256={connection-id-hash-secondary}",
    "userId": "{userId}",
    "connectionId": "{connectionId}",
    "hub": "{hub}",
    "eventName": "disconnect",
    "datacontenttype" : "`application/json",
    "data" : {
        "reason": "{Reason}"
    }
}

```

This example shows a response in `structured` format:

```JSON
HTTP/1.1 200 OK
Content-Type: application/cloudevents+json; charset=utf-8
Content-Length: nnnn
{
    "specversion" : "1.0",
    "type" : "azure.webpubsub.sys.disconnect",
    "source" : "/hubs/{hub}/client/{connectionId}",
    "id" : "{eventId}",
    "connectionId": "{connectionId}",
    "time": "2021-01-01T00:00:00Z",
}

```

* `reason`

    The `reason` describes the reason the client disconnects.