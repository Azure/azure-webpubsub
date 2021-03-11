---
layout: docs
toc: true
title: Azure Function Integration
group: specs
---

- [Supported scenarios](#supported-scenarios)
- [Development Plan](#development-plan)
- [Bindings and Workflow](#bindings-and-workflow)
  - [`WebPubSubConnection` Input Binding](#webpubsubconnection-input-binding)
  - [`WebPubSubTrigger` Trigger binding](#webpubsubtrigger-trigger-binding)
  - [`WebPubSub` Output Binding](#webpubsub-output-binding)
- [Bindings Usage](#bindings-usage)
  - [Using the WebPubSubConnection input binding](#using-the-webpubsubconnection-input-binding)
  - [Using the WebPubSubTrigger trigger binding](#using-the-webpubsubtrigger-trigger-binding)
  - [Using the WebPubSub output binding](#using-the-webpubsub-output-binding)
  - [Supported object types for Output bindings.](#supported-object-types-for-output-bindings)
    - [WebPubSubEvent](#webpubsubevent)
    - [MessageEvent](#messageevent)
    - [GroupEvent](#groupevent)
    - [CloseConnectionEvent](#closeconnectionevent)
    - [ExistenceEvent (Limited)](#existenceevent-limited)

## Supported scenarios

- Allow clients to connect to a Web PubSub Service hub without a self-host server.
- Use Azure Functions (any language supported by V2) to broadcast messages to all clients connected to a Web PubSub Service hub.
- Use Azure Functions (any language supported by V2) to send messages to a single user/connection, or all the users/connections in a group.
- Use Azure Functions (any language supported by V2) to manage group users like add/remove/check a single user/connection in a group.

## Development Plan

[Azure WebPubSub Development Plan](https://github.com/Azure/azure-webpubsub/blob/main/docs/specs/development-plan.md)

- [ ] **Phase 1** Support simple websocket clients

- [ ] **Phase 2** Support subprotocol websocket clients

- [ ] **Portal Support** Azure Portal integration for an easy working experience to create/configure Azure Functions for Web PubSub service.

> Subprotocol de-serialization is done by service side. Server will have a consistent `Event` property to understand the request. So not much gap between phase 1 & 2 in function side.

## Bindings and Workflow

![functions workflow](../images/functions_workflow.png)

### `WebPubSubConnection` Input Binding
***Client Negotiation (1)-(2)***

Clients use `HttpTrigger` to request functions return `WebPubSubConnection` input binding which provides service websocket url along with access token. Input binding makes it easy to generate required information to setup websocket connections in client side. This step is optional that if clients already configured with service information, it can skip negotiation and direct raise websocket connection request to service and refer to next step.

### `WebPubSubTrigger` Trigger binding
***Client Websocket requests (3)-(4)***

Clients set up websocket connection to service, and clients can send connect/message/disconnect request through the websocket connection on demand. Service will forward these events to functions by `WebPubSubTrigger` to let function known and do something. Especially, functions can accept/block the request for connect/message(synchronous events), refer to [this](https://github.com/Azure/azure-webpubsub/blob/main/docs/specs/phase-1-simple-websocket-client.md#simple-websocket-connection) for details.

### `WebPubSub` Output Binding 
***Function requests (5)-(6)***

When function is triggered, it can send any messaging request by `WebPubSub` output bindings to service. And service will accordingly do broadcast or managing groups operation regarding the rest api calls.

## Bindings Usage

### Using the WebPubSubConnection input binding

 Customer can set `Hub`, `UserId` and `Claims` in the input binding where values can pass through the request parameters. For example, `UserId` can be used with {headers.userid} or {query.userid} depends on where the userid is assigned in the negotiate call. `Hub` is required in the binding.

* csharp usage:
```cs
[FunctionName("login")]
public static WebPubSubConnection GetClientConnection(
    [HttpTrigger(AuthorizationLevel.Anonymous, "get", "post")] HttpRequest req,
    [WebPubSubConnection(HubName = "simplechat", UserId = "{query.userid}")] WebPubSubConnection connection,
    ILogger log)
{
    return connection;
}
```

* javascript usage:
```js
{
    "type": "webpubsubConnection",
    "name": "connection",
    "userId": "{query.userid}",
    "hubName": "simplechat",
    "direction": "in"
}
```
```js
module.exports = function (context, req, connection) {
  context.res = { body: connection };
  context.done();
};
```

### Using the WebPubSubTrigger trigger binding

When clients already know Web PubSub service and communication to service, `WebPubSubTrigger` can be used as listener towards all kinds of requests coming from service. Function will use `WebPubSubTrigger` attributes as the **UNIQUE** key to map correct function. `EventType` will set to `system` by default. 

EventType|(Allowed) Event
--|--
system|connect, connected, disconnect
user|any, e.g. message or user defined in subprotocol

`ConnectionContext` is a binding object contains common fields among all request, basically refer to [CloudEvents](protocol-cloudevents.md#events) for available fields. Other optional binding objects differs on the scenarios can be bind on-demand, details are listed below. Binding name matters to distinguish same type of parameters, i.e. for claims and queries in current stage.

Binding Name | Binding Type | Description | Members
--|--|--|--
context|`ConnectionContext`|Common request information|Type, Event, Hub, ConnectionId, UserId, Headers, Queries, Claims
message|`Stream` |Request message content|-
dataType|`MessageDataType`|Data type of request message|-
claims|`IDictionary<string, string[]>`|User Claims in connect request|-
subprotocols|`string[]`|Available subprotocols in connect request|-
queries|`IDictionary<string, string[]>`|Queries in connect request|-
clientCertificates|`ClientCertificateInfo[]`|Client certs in connect request|-
reason|`string`|Reason in disconnect request|-

`WebPubSubTrigger` will respect customer returned response for synchronous events of `connect` and `message`. Only matched response will be sent back to service, otherwise, it will be ignored. Notice that `Error` has higher priority than rest fields that if `Error` is set, service will regard this request as failed and take some actions like drop down client connection and log information in service side. If user needs to send message back to current connection using `MessageResponse`, `DataType` is suggested to set within `MessageResponse` to improve data encode/decode. `DataType` is limited to `text`, `json` and `binary` and default value is `binary`.

Return Type | Description | Members
--|--|--
`ConnectResponse`| Response for `connect` event | Error, Groups, Roles, UserId, Subprotocol
`MessageResponse`| Response for user event | Error, DataType, Message

* csharp usage:
```cs
[FunctionName("connect")]
public static ConnectResponse Connect(
[WebPubSubTrigger(Hub = "simplechat", EventName = "connect", EventType = "system")]ConnectionContext context)
{
    Console.WriteLine($"{context.ConnectionId}");
    Console.WriteLine("Connect.");
    if (context.UserId == "abc")
    {
        return new ConnectResponse()
        {
            Error = new Error { Code = ErrorCode.Unauthorized, Error = "Invalid User" }
        };
    }
    else 
    {
        return new ConnectResponse()
        {
            Roles = new string[] { "Admin" }
        };
    }
}
```

* javascript usage:
```js
{
    "type": "webpubsubTrigger",
    "name": "connectionContext",
    "hub": "simplechat",
    "event": "connect",
    "eventType", "system"
    "direction": "in"
}
```
```js
module.exports = function (context, connectionContext) {
  context.log('Receive event: ${context.bindingData.event} from connection: ${context.bindingData.connectionId}.');
  context.bindings.response = [{
      "code": "unauthorized",
      "error": "Invalid User"
  }];
  context.done();
};
```

### Using the WebPubSub output binding

For a single request, customer can bind to a target operation related event type to send the request. For `MessageEvent`, customer can set `DataType` (allowed `binary`, `text`, `json`) to improve processing efficiency and `null` will be regarded as `binary`.

* csharp usage:
```cs
[FunctionName("broadcast")]
[return: WebPubSub]
public static MessageEvent Broadcast(
    [WebPubSubTrigger(Hub = "simplechat", EventName = "message", EventType = "user")] ConnectionContext context,
    Stream message)
{
    return new MessageEvent
    {
        Message = message
    };
}
```

* javascript usage:
```js
{
    "type": "webpubsubTrigger",
    "name": "connectionContext",
    "hub": "simplechat",
    "eventName": "message",
    "eventType": "user",
    "direction": "in"
},
{
    "type": "webpubsub",
    "name": "messageData",
    "hubName": "simplechat",
    "direction": "out"
}
```
```js
module.exports = async function (context, connectionContext) {
    context.bindings.messageData = [{
        "message": context.bindingData.message
        "dataType": "text"
    }];
    context.done();
};
```

To send multiple requests, customer need to work with generic `WebPubSubEvent` and do multiple tasks in order.

* csharp usage:
```cs
[FunctionName("message")]
public static async Task<MessageResponse> Message(
    [WebPubSubTrigger(Hub = "simplechat", EventName = "message", EventType = "user")] ConnectionContext context,
    Stream message,
    MessageDataType dataType,
    [WebPubSub] IAsyncCollector<WebPubSubEvent> eventHandler)
{
    await eventHandler.AddAsync(new GroupEvent
    {
        Action = GroupAction.Join,
        TargetType = TargetType.Users,
        TargetId = context.UserId,
        GroupId = "group1",
    });
    await eventHandler.AddAsync(new MessageEvent
    {
        Message = message,
        DataType = dataType
    });

    return new MessageResponse
    {
        Message = new MemoryStream(Encoding.UTF8.GetBytes("[Ack] message received")),
        DataType = MessageDataType.Text
    }；
}
```

> When SDK has better supports, server side could work with server sdk convenience layer methods without output binding data type limited. And method response will have enrich properties.
> ```cs
> [FunctionName("message")]
> public static async Task Message(
>     [WebPubSubTrigger(Hub = "simplechat", EventName = "message", EventType = "user")] ConnectionContext context,
>     Stream message,
>     MessageDataType dataType)
> {
>     var server = context.GetWebPubSubServer();
>     await server.Users.AddToGroupAsync(context.UserId, "group1");
>     await server.All.SendAsync(message, dataType);
> }
> ```

### Supported object types for Output bindings.

#### WebPubSubEvent 
A generic base class to send multiple tasks.

#### MessageEvent

1. `TargetType`, supports All, Users, Connections, Groups, default as All
2. `TargetId`, use with `TagetType`, where target id should be assigned if `TargetType` is not All.
3. `Excludes`, excludes connection ids
4. `Message`
5. `DataType`, supports `binary`, `text`, `json`

#### GroupEvent

1. `GroupAction`, supports Join/Leave/LeaveAll
2. `TargetType`, supports Users/Connections
3. `TargetId`
4. `GroupId`

#### CloseConnectionEvent

1. `ConnectionId`
2. `Reason`

#### ExistenceEvent (Limited)

1. `TargetType` supports Users/Connections/Groups
2. `TargetId`

> Response result is not able to reflect. May not be supported in the initial version.