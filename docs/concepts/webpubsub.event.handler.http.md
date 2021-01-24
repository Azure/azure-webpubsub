            
## Event Handler HTTP Protocol Details

### Connect
#### Url Parameters:
* `category`: `connections`
* `event`: `connect`

#### Verb: `POST`

#### HEAD:
*`?` to indicate this header is optional*

* `Sec-WebSocket-Protocol?`: `{subprotocols}`
* `X-ASRS-Client-Cert-Thumbprint?`: `{thumbprint}`
* `X-ASRS-Connection-Id`: `{connection-id}`
* `X-ASRS-Hub`: `{hubname}`
* `X-ASRS-Category`: `connections`
* `X-ASRS-Event`: `handshake`
* `X-ASRS-User-Id`: `{user-id}`
* `X-ASRS-User-Claims`: `{user-claims}`
* `X-ASRS-Signature`: `sha256={connection-id-hash-primary},sha256={connection-id-hash-secondary}`
* `X-ASRS-Client-Query?`: `{query-string}`
* `X-Forwarded-For`: `1.2.3.4, 5.6.7.8`
* `Date`: `Fri, 10 Jan 2020 01:02:03 GMT`

#### Body: `empty`

#### Response Headers:
*`?` to indicate this header is optional*

* `Sec-WebSocket-Protocol?`: `{subprotocol}`

The `connect` event forwards the subprotocol and authentication information to Upstream from the client. The Azure SignalR Service uses the status code to determine if the request will be upgraded to WebSocket protocol.

If the request contains the `Sec-WebSocket-Protocol` header with one or multiple supported sub-protocols. The server should return one sub-protocol it supports. If the server doesn't want to use any subprotocols, it should **not** send the `Sec-WebSocket-Protocol` header. [Sending a blank header is invalid](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers#Subprotocols).

* `X-ASRS-User-Id?`: `{authed user id}`

As the service allows anonymous connections, it is the `connect` event's responsibility to tell the service the user id of the client connection. The Service will read the user id from the response header `X-ASRS-User-Id` if it exists. The connection will be dropped if user id cannot be read from the request claims nor the `connect` event's response header.

<a name="connect_response_header_group">
 
* `X-ASRS-Connection-Group?`: `{group}`

The header provides a convenient way for user to add this connection to one or multiple groups in response header. In this way, there is no need to have an additional call to add this connection to some group.

#### Response Status Codes:
* `2xx`: Success, the WebSocket connection is going to be established.
* `4xx`: Error, the response from Upstream will be returned as the response for the client request.

### Send Messages
The service calls the Upstream for every complete WebSocket message.

#### Url Parameters:
* `category`: `messages`
* `event`: `message`

#### Verb: `POST`

#### HEAD:
*`?` to indicate this header is optional*

* `X-ASRS-Hub`: `{hubname}`
* `X-ASRS-Category`: `messages`
* `X-ASRS-Connection-Id`: `{connection-id}`
* `X-ASRS-Event`: `message`
* `X-ASRS-User-Id`: `{user-id}`
* `X-ASRS-User-Claims`: `{user-claims}`
* `X-ASRS-Signature`: `sha256={connection-id-hash-primary},sha256={connection-id-hash-secondary}`
* `X-ASRS-Client-Query?`: `{query-string}`
* `X-Forwarded-For`: `1.2.3.4, 5.6.7.8`
* `Date`: `Fri, 10 Jan 2020 01:02:03 GMT`
* `Content-Type`: `application/octet-stream`(for binary frame)|`text/plain`(for text frame)

#### Body: `{message payload}`

### Disconnect

**Disconnect** event will **always** be triggered when the client request completes if the **Connect** event returns `2xx` status code.

#### Url Parameters:
* `category`: `connections`
* `event`: `disconnect`

#### Verb: `POST`

#### HEAD:
*`?` to indicate this header is optional*

* `X-ASRS-Hub`: `{hubname}`
* `X-ASRS-Category`: `connections`
* `X-ASRS-Connection-Id`: `{connection-id}`
* `X-ASRS-Event`: `disconnect`
* `X-ASRS-User-Id`: `{user-id}`
* `X-ASRS-User-Claims`: `{user-claims}`
* `X-ASRS-Signature`: `sha256={connection-id-hash-primary},sha256={connection-id-hash-secondary}`
* `X-ASRS-Client-Query?`: `{query-string}`
* `X-Forwarded-For`: `1.2.3.4, 5.6.7.8`
* `Date`: `Fri, 10 Jan 2020 01:02:03 GMT`

#### Body: `empty`
