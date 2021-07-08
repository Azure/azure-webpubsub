---
layout: docs
toc: true
group: references
---
         
## Web PubSub CloudEvents protocol

Service delivers client events to the upstream webhook using the [CloudEvents HTTP protocol](https://github.com/cloudevents/spec/blob/v1.0.1/http-protocol-binding.md).

The data sending from service to server is always in CloudEvents `binary` format.

- [Webhook Validation](#protection)
- [Web PubSub CloudEvents Attribute Extension](#extension)
- [Events](#events)
    - Blocking events
        - [System `connect` event](#connect)
        - [User events](#message)
    - Unblocking events
        - [System `connected` event](#connected)
        - [System `disconnected` event](#disconnected)

## Webhook Validation
<a name="protection"></a>

The Webhook validation follows [CloudEvents](https://github.com/cloudevents/spec/blob/v1.0/http-webhook.md#4-abuse-protection). The request always contains `WebHook-Request-Origin: xxx.webpubsub.azure.com` in the header.

If and only if the delivery target does allow delivery of the events, it MUST reply to the request by including `WebHook-Allowed-Origin` header, e.g.

`WebHook-Allowed-Origin: *`

Or:

`WebHook-Allowed-Origin: xxx.webpubsub.azure.com`

For now , we do not support [WebHook-Request-Rate](https://github.com/cloudevents/spec/blob/v1.0/http-webhook.md#414-webhook-request-rate) and [WebHook-Request-Callback](https://github.com/cloudevents/spec/blob/v1.0/http-webhook.md#413-webhook-request-callback).


## Web PubSub CloudEvents Attribute Extension
<a name="extension"></a>

> It was also noted that the HTTP specification is now following a similar pattern by no longer suggesting that extension HTTP headers be prefixed with X-.

This extension defines attributes used by Web PubSub for every event it produces.

### Attributes

| Name | Type | Description | Example|
|--|--|--|--|
| `userId` | `string` | The user the connection authed | |
| `hub` | `string` | The hub the connection belongs to | |
| `connectionId` | `string` | The connectionId is unique for the client connection | |
| `eventName` | `string` | The name of the event without prefix | |
| `subprotocol` | `string` | The subprotocol the client is using if any | |
| `connectionState-{key}` | `string` | Defines the state for the specific `key` for the connection| |
| `signature` | `string` | The signature for the upstream webhook to validate if the incoming request is from the expected origin. The service calcuates the value using both primary access key and secondary access key as the HMAC key: `Hex_encoded(HMAC_SHA256(accessKey, connectionId))`. The upstream should check if the request is valid before processing it. | |

## Events

There are two types of events, one is *blocking* events that the service waits for the response of the event to continue. One is *unblocking* events that the service does not waiting for the response of such event before processing the next message.

- Blocking events
    - [System `connect` event](#connect)
    - [User events](#message)
- Unblocking events
    - [System `connected` event](#connected)
    - [System `disconnected` event](#disconnected)

### System `connect` event
<a name="connect"></a>

* `ce-type`: `azure.webpubsub.sys.connect`
* `Content-Type`: `application/json`

#### Request Format:

```HTTP
POST /upstream HTTP/1.1
Host: xxxxxx
WebHook-Request-Origin: xxx.webpubsub.azure.com
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

#### Success Response Format:
* Status code:
    * `204`: Success, with no content.
    * `200`: Success, the content SHOULD be a JSON format, with following properties allowed:
* Header `ce-connectionState-{key}`: If this header exists, the connection state for the specific key is updated with the response header. Please note that only *blocking* events can update the connection state.

```HTTP
HTTP/1.1 200 OK
ce-connectionState-key1: value-1
ce-connectionState-key1: value-another
ce-connectionState-key2: value-2

{
    "groups": [],
    "userId": "",
    "roles": [],
    "subprotocol": ""
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

* `roles`: `{roles the client has}`
    
    The property provides a way for the upstream to authorize the client. Different roles defines different initial permissions the client has, it can be useful when the client is a PubSub WebSocket client. Details about the permissions a role has is described in [Client roles](./2-client-protocols-in-detail.md#auth).

#### Error Response Format:

* `4xx`: Error, the response from Upstream will be returned as the response for the client request.

```HTTP
HTTP/1.1 401 Unauthorized
```

### System `connected` event
<a name="connected"></a>
The service calls the Upstream when the client completes WebSocket handshake and is successfully connected.

* `ce-type`: `azure.webpubsub.sys.connected`
* `Content-Type`: `application/json`
* `ce-connectionState-{key1}`: `value1`

Request body is empty JSON.

#### Request Format:

```HTTP
POST /upstream HTTP/1.1
Host: xxxxxx
WebHook-Request-Origin: xxx.webpubsub.azure.com
Content-Type: application/json; charset=utf-8
Content-Length: nnnn
ce-specversion: 1.0
ce-type: azure.webpubsub.sys.connected
ce-source: /hubs/{hub}/client/{connectionId}
ce-id: {eventId}
ce-time: 2021-01-01T00:00:00Z
ce-signature: sha256={connection-id-hash-primary},sha256={connection-id-hash-secondary}
ce-userId: {userId}
ce-connectionId: {connectionId}
ce-hub: {hub}
ce-eventName: connect
ce-subprotocol: abc
ce-connectionState-key1: value-1
ce-connectionState-key1: value-another
ce-connectionState-key2: value-2

{}

```

#### Response Format:

`2xx`: success response.

`connected` is an asynchronous event, when the response status code is not success, the service logs an error.

```HTTP
HTTP/1.1 200 OK
```


### System `disconnected` event
<a name="disconnected"></a>
`disconnected` event is **always** triggered when the client request completes if the **connect** event returns `2xx` status code.

* `ce-type`: `azure.webpubsub.sys.disconnected`
* `Content-Type`: `application/json`

#### Request Format:

```HTTP
POST /upstream HTTP/1.1
Host: xxxxxx
WebHook-Request-Origin: xxx.webpubsub.azure.com
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
ce-subprotocol: abc
ce-connectionState-key1: value-1
ce-connectionState-key1: value-another
ce-connectionState-key2: value-2

{
    "reason": "{Reason}"
}

```

* `reason`

    The `reason` describes the reason the client disconnects.


#### Response Format:

`2xx`: success response.

`disconnected` is an asynchronous event, when the response status code is not success, the service logs an error.

```HTTP
HTTP/1.1 200 OK
```

### User event `message` for the simple WebSocket clients
<a name="message"></a>
The service invokes the event handler upstream for every WebSocket message frame.

* `ce-type`: `azure.webpubsub.user.message`
* `Content-Type`: `application/octet-stream` for binary frame; `text/plain` for text frame; 

UserPayload is what the client sends.

#### Request Format:

```HTTP
POST /upstream HTTP/1.1
Host: xxxxxx
WebHook-Request-Origin: xxx.webpubsub.azure.com
Content-Type: application/octet-stream | text/plain | application/json
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
ce-connectionState-key1: value-1
ce-connectionState-key1: value-another
ce-connectionState-key2: value-2

UserPayload

```

#### Success Response Format

* Status code
    * `204`: Success, with no content.
    * `200`: Success, the format of the `UserResponsePayload` depends on the `Content-Type` of the response.
* Header `Content-Type`: `application/octet-stream` for binary frame; `text/plain` for text frame; 
* Header `ce-connectionState-{key}`: If this header exists, the connection state for the specific key is updated with the response header. Please note that only *blocking* events can update the connection state.

When the `Content-Type` is `application/octet-stream`, the service sends `UserResponsePayload` to the client using `binary` WebSocket frame. When the `Content-Type` is `text/plain`, the service sends `UserResponsePayload` to the client using `text` WebSocket frame. 

```HTTP
HTTP/1.1 200 OK
Content-Type: application/octet-stream (for binary frame) or text/plain (for text frame)
Content-Length: nnnn
ce-connectionState-key1: value-1
ce-connectionState-key1: value-another
ce-connectionState-key2: value-2

UserResponsePayload
```

#### Error Response Format
When the status code is not success, it is considered to be error response. The connection would be **dropped** if the `message` response status code is not success.

### User custom event `{custom_event}` for the PubSub WebSocket Client
<a name="custom_event"></a>

The service calls the event handler webhook for every valid custom event message.

#### Case 1: send event with text data:
```json
{
    "type": "event",
    "event": "<event_name>",
    "dataType" : "text",
    "data": "text data"
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
ce-subprotocol: json.webpubsub.azure.v1
ce-connectionState-key1: value-1
ce-connectionState-key1: value-another
ce-connectionState-key2: value-2

text data

```

#### Case 2: send event with json data:
```json
{
    "type": "event",
    "event": "<event_name>",
    "dataType" : "json",
    "data": {
        "hello": "world"
    }, 
}
```

What the upstream event handler receives like below, please note that the `Content-Type` for the CloudEvents HTTP request is `application/json` for `dataType`=`json`

```HTTP
POST /upstream HTTP/1.1
Host: xxxxxx
WebHook-Request-Origin: xxx.webpubsub.azure.com
Content-Type: application/json
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
ce-subprotocol: json.webpubsub.azure.v1

{
    "hello": "world"
}

```

#### Case 3: send event with binary data:
```json
{
    "type": "event",
    "event": "<event_name>",
    "dataType" : "binary",
    "data": "aGVsbG8gd29ybGQ=" // base64 encoded binary
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
ce-subprotocol: json.webpubsub.azure.v1

<binary data>

```

#### Success Response Format

```HTTP
HTTP/1.1 200 OK
Content-Type: application/octet-stream | text/plain | application/json
Content-Length: nnnn
ce-connectionState-key1: value-1
ce-connectionState-key1: value-another
ce-connectionState-key2: value-2

UserResponsePayload
```
* Status code
    * `204`: Success, with no content.
    * `200`: Success, data sending to the PubSub WebSocket client depends on the `Content-Type`; 

* Header `ce-connectionState-{key}`: If this header exists, the connection state for the specific key is updated with the response header. Please note that only *blocking* events can update the connection state.

* When Header `Content-Type` is `application/octet-stream`, the service sends `UserResponsePayload` back to the client using `dataType` as `binary` with payload base64 encoded. A sample response:
    ```json
    {
        "type": "message",
        "from": "server",
        "dataType": "binary",
        "data" : "aGVsbG8gd29ybGQ="
    }
    ```
* When the `Content-Type` is `text/plain`, the service sends `UserResponsePayload` to the client using `dataType` as  `text` with payload string.
* When the `Content-Type` is `application/json`, the service sends `UserResponsePayload` to the client using `dataType`=`json` with `data` value token as the response payload body.


#### Error Response Format
When the status code is not success, it is considered to be error response. The connection would be **dropped** if the `{custom_event}` response status code is not success.
