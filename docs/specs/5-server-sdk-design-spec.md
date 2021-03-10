---
layout: docs
toc: true
title: Server SDK Design Spec
group: specs
---

## Table of Content
- [Scope for Public Preview](#scope)
- [JavaScript](#js)
- [C#](#csharp)
- [Python](#python)
- [Java]

## Scope for Public Preview
<a name="scope"></a>

The server SDK, providing a convinience way for the users to use the service, should contain the following features:
1. [All 4] Service->Server REST API support
1. [C#, JS] Client Auth token generator
1. [C#, JS] Provide HTTP middleware for handle:
    1. Client negotiate requests
    1. CloudEvents validation requests
    1. CloudEvents event requests

## JavaScript SDK Design
<a name="js"></a>

### Packages
1. Package1: `azure-webpubsub` (name TBD)
    * To provide the REST APIs invoking the Web PubSub service
    * To provide utility functions for client negotiate
    * This can be used in Azure Function for advanced message senders
2. Package2: `azure-webpubsub-node` (name TBD)
    * To provide node/express middleware for handle:
        * client negotiate requests
        * CloudEvents validation requests
        * CloudEvents event requests

### Data structure

#### Request

```ts
// common context for the connection
interface ConnectionContext {
  hub: string;
  connectionId: string;
  eventName: string;
  userId?: string;
}

// for `connect` event
interface ConnectRequest {
  context: ConnectionContext;
  claims?: { [key: string]: string[] };
  queries?: { [key: string]: string[] };
  subprotocols?: string[];
  clientCertificates?: ClientCertificate[];
}

// for `connected` event
interface ConnectedRequest {
  context: ConnectionContext;
}

// for user events, `message` or custom events
interface UserEventRequest {
  context: ConnectionContext;
  payload: PayloadData;
}

// for `disconnected` event
interface DisonnectedRequest {
  context: ConnectionContext;
  reason?: string;
}

interface ClientCertificate {
  thumbprint: string;
}

interface PayloadData {
  dataType: PayloadDataType; // Response Content-Type should be `plain/text` for PayloadDataType.text, and `application/octet-stream` for PayloadDataType.binary, and `application/json` for PayloadDataType.json
  data: string | ArrayBuffer, 
}

enum PayloadDataType {
  binary,
  text,
  json,
}
```


#### Response

Only *synchronous* events `event` and user events (`message` or custom events) need responses.

```ts

interface ErrorResponse {
  code: ErrorCode;
  detail?: string;
}

enum ErrorCode {
  serverError, // Response to service using 500
  userError, // Response to service using 400
  unauthorized, // Response to service using 401
}

interface ConnectResponse {
  error?: ErrorResponse; // If error is set, we consider this a failed response
  groups?: string[];
  roles?: string[];
  userId?: string;
  subprotocol?: string;
}

interface PayloadData {
  dataType: PayloadDataType; // Response Content-Type should be `plain/text` for PayloadDataType.text, and `application/octet-stream` for PayloadDataType.binary, and `application/json` for PayloadDataType.json
  data: string | ArrayBuffer, 
}

// for user events, `message` or custom events
interface UserEventResponse {
  error?: ErrorResponse // If error is set, we consider this a failed response
  payload?: PayloadData
}

enum PayloadDataType {
  binary,
  text,
  json,
}

```

### API

1. Client negotiate utility function
    ```ts
    export interface NegotiateResponse {
      url: string;
      token: string;
    }
    interface NegotiateOptions {
        userId?: string;
        claims?: {
            [key: string]: string[];
        };
    }
    export declare class WebPubSubServiceHubContext {
        constructor(conn: string, hub: string);
        clientNegotiate(options?: NegotiateOptions): NegotiateResponse;
    }
    ```
    * This can be used in Azure Function for advanced message senders

2. To provide node/express middleware for handle incoming requests
    ```js
    export interface WebPubSubHandlerOptions {
      onConnect?: (r: ConnectRequest) => ConnectResponse | Promise<ConnectResponse>
      onUserEvent?: (r: UserEventRequest) => UserEventResponse | Promise<UserEventResponse>
      onConnected?: (r: ConnectedRequest) => void | Promise<void>;
      onDisconnected?: (r: DisconnectedRequest) => void | Promise<void>;
    }

    export declare class WebPubSubHandler {
        /**
         * The name of the hub this client is connected to
        */
        readonly eventHandlerUrl: string;
        constructor(connectionString: string, hub: string, options?: WebPubSubHandlerOptions);
        handleNodeRequest(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
        getMiddleware(): express.Router;
    }
    ```

### Sample usage
#### For express
```js
const handler = new WebPubSubHandler(process.env.WPS_CONNECTION_STRING!,
  {
    onConnect: async connectRequest => {
      console.log(connectRequest.context.connectionId);
      return {
        userId: "vicancy"
      }; 
    }
  }
);

const app = express();

app.use(handler.getMiddleware())

app.listen(3000, () => console.log(`Azure WebPubSub Upstream ready at http://localhost:3000${handler.eventHandlerUrl}`));
```

#### For raw node
```js
const handler = new WebPubSubHandler(process.env.WPS_CONNECTION_STRING!,
  {
    eventHandlerUrl: "/customUrl", // optional
    hub: "chat",
    onConnect: async connectRequest => {
      console.log(connectRequest.context);
      return {
        userId: "vicancy"
      }; // or connectRequest.fail(); to 401 the request
    },
    onUserEvent: async userRequest => {
      return {
        body: "Hey " + userRequest.data,
      };
    },
    onDisconnected: async disconnectRequest => {
      console.log(disconnectRequest.context.userId + " disconnected");
    }
  }
);

const port = 5555;

const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
  if (await handler.handleNodeRequest(request, response)){
    console.log(`Processed ${request.url}`);
  }
  else{
    console.log(`${request.url} for others to process`);
    response.statusCode = 404;
    response.end();
  }
});

server.listen(port, () => console.log(`Azure WebPubSub Upstream ready at http://localhost:${port}${handler.eventHandlerUrl}`));
```

## C# SDK Design
<a name="csharp"></a>

### Packages
1. Package1: `Azure.WebPubSub.Common` (name TBD)
    * To provide the REST APIs invoking the Web PubSub service
    * To provide utility functions for client negotiate
    * This can be used in Azure Function for advanced message senders
2. Package2: `Azure.WebPubSub.AspNetCore` (name TBD)
    * To provide aspnetcore middleware for handle:
        * To handle client negotiate requests
        * To handle CloudEvents validation requests
        * To handle CloudEvents event requests

### Data structure

#### Request

```cs
public class ConnectionContext
{
    public string Hub { get; set; }

    public string ConnectionId { get; set; }

    public string EventName { get; set; }

    [AllowNull]
    public string UserId { get; set; }
}

public class ConnectRequest
{
    public ConnectionContext Context { get; set; }

    [AllowNull]
    public Dictionary<string, string[]> Claims { get; set; }

    [AllowNull]
    public Dictionary<string, string[]> queries { get; set; }

    [AllowNull]
    public string[] Subprotocols { get; set; }

    [AllowNull]
    public ClientCertificate[] ClientCertificates { get; set; }
}

public class UserEventRequest
{
    public ConnectionContext Context { get; set; }
    public PayloadData Payload { get; set; }
}

public class DisconnectedRequest
{
    public ConnectionContext Context { get; set; }

    [AllowNull]
    public string Reason { get; set; }
}

public class ConnectedRequest
{
    public ConnectionContext Context { get; set; }

}

public enum PayloadDataType
{
    Binary,
    Text,
    Json
}

public class ClientCertificate
{
    public string Thumbprint { get; set; }
}
```

#### Response

Only *synchronous* events `event` and user events (`message` or custom events) need responses.

```cs
public enum ResponseErrorCode
{
    ServerError,
    UserError,
    Unauthorized,
}

public class ErrorResponse
{
    public ResponseErrorCode Code { get; set; }

    public string Detail { get; set; }
}

public class ConnectResponse
{
    [AllowNull]
    public ErrorResponse Error { get; set; }

    [AllowNull]
    public string[] Groups { get; set; }

    [AllowNull]
    public string[] Roles { get; set; }

    [AllowNull]
    public string UserId { get; set; }

    [AllowNull]
    public string Subprotocol { get; set; }
}

public class UserEventResponse
{
    [AllowNull]
    public ErrorResponse Error { get; set; }

    [AllowNull]
    public PayloadData Payload { get; set; }
}

public class PayloadData
{
    public ReadOnlySequence<byte> Data { get; set; }

    public PayloadDataType DataType { get; set; }
}
```

#### API

1. Client negotiate utility function
    ```cs
    public class NegotiateResponse
    {
        public string Url { get; set; }
        public string AccessToken { get; set; }
    }
    
    public class NegotiateOptions
    {
        public string UserId { get; set; }

        public IList<Claim> Claims { get; set; }
    }

    public class WebPubSubServiceHubContext
    {
        public WebPubSubServiceHubContext(string conn, string hub);

        public Task<NegotiateResponse> ClientNegotiateAsync(NegotiateOptions options, CancellationToken cancellationToken);
    }
    ```
    * This can be used in Azure Function for advanced message senders
2. To provide ASPNETCore middleware for handle incoming requests
    ```cs
    public class WebPubSubHandlerOptions
    {
        Func<ConnectRequest, Task<ConnectResponse>> OnConnectAsync { get; set; }
        Func<UserEventRequest, Task<UserEventResponse>> OnUserEventAsync { get; set; }
        Func<ConnectedRequest, Task> OnConnectedAsync { get; set; }
        Func<DisconnectedRequest, Task> OnDisconnectedAsync { get; set; }
    }

    public static class StartupExtension
    {
        public static IApplicationBuilder UseWebPubSubHandler(this IApplicationBuilder app);
        public static IApplicationBuilder UseWebPubSubHandler(this IApplicationBuilder app, PathString path);
        public static IApplicationBuilder UseWebPubSubHandler(this IApplicationBuilder app, PathString path, WebPubSubHandlerOptions options);
    }
    ```

### Sample usage
```cs
public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
{
    app.UseWebPubSubHandler();
}
```

## Python SDK proposal
<a name="python"></a>

### Handler

```python
import os

from azure.webpubsub import WebPubSubHandler

def _on_connect(handler, req):
  return {
    "user_id": "terence",
  }


def _on_connected(handler, req):
  handler.broadcast("{} connected".format(req.context.connection_id))


def _on_user_event(handler, req):
  return {
    "body": "Hey ", req.data
  }


def _on_disconnected(handler, req):
  print("{} disconnected".format(req.context.user_id))


handler = WebPubSubHandler(
  os.getenv("WPS_CONNECTION_STRING"),
  event_handler_url="/customUrl",
  hub="chat",
  on_connect=_on_connect,
  on_connected=_on_connected,
  on_disconnected=_on_disconnected,
  on_user_event=_on_user_event,
)
```

### For gunicorn (http server)

```python
(handler part)

def app(environ, start_response):
  # parse HTTP body and headers from environ
  # https://wsgi.readthedocs.io/en/latest/definitions.html
  return handler.process(environ)
```

**Command line**

```bash
gunicorn app:app
```


### For wsgi (middleware)

[PEP 3333](https://www.python.org/dev/peps/pep-3333/#middleware-components-that-play-both-sides)

For example, we use flask as our framework.

```python
(handler)

from flask import Flask

app = Flask('WebPubSub')

app.wsgi_app = handler.middleware(app.wsgi_app)

if __name__ == "__main__":
    app.run('127.0.0.1', '5000', debug=True)
```

Similar codes for django.

```python
(handler)

from django.core.wsgi import get_wsgi_application

app = get_wsgi_application()
app = handler.middleware(app)

if __name__ == "__main__":
    from django.core.management import execute_from_command_line
    execute_from_command_line(sys.argv)
```