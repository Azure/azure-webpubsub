# Azure Functions Bindings for Azure Web PubSub Service

## NuGet Packages

Package Name | Target Framework | NuGet
---|---|---
Microsoft.Azure.WebJobs.Extensions.WebPubSub | .NET Standard 2.0 | 

## Intro
These bindings allow Azure Functions to integrate with **Azure Web PubSub Service**.

### Supported scenarios

- Allow clients to connect to a Web PubSub Service hub without a self-host server.
- Use Azure Functions (any language supported by V2) to broadcast messages to all clients connected to a Web PubSub Service hub.
- Use Azure Functions (any language supported by V2) to send messages to a single user/connection, or all the users/connections in a group.
- Use Azure Functions (any language supported by V2) to manage group users like add/remove/check a single user/connection in a group.
- Example scenarios include: broadcast messages to a Web PubSub Service hub on HTTP requests.

### Bindings and workflow

#### `WebPubSubConnection` input binding for negotiation (1)-(2)
Clients use `HttpTrigger` to request functions return `WebPubSubConnection` input binding which provides service websocket url along with access token. Input binding makes it easy to generate required information to setup websocket connections in client side. This step is optional that if clients already configured with service information, it can skip negotiation and direct raise websocket connection request to service and refer to next step.

#### `WebPubSubTrigger` for websocket requests (3)-(4)
Clients set up websocket connection to service, and clients can send connect/message/disconnect request through the websocket connection on demand. Service will forward these events to functions by `WebPubSubTrigger` to let function known and do something. Especially, functions can accept/block the request for connect/message(synchronous events), refer to [this](https://github.com/Azure/azure-webpubsub/blob/main/docs/specs/phase-1-simple-websocket-client.md#simple-websocket-connection) for details.

#### `WebPubSub` output binding (5)-(6) 
When function is triggered, it can send any messaging request by `WebPubSub` output bindings to service. And service will accordingly do broadcast or managing groups operation regarding the rest api calls.

### Development Plan

[Azure WebPubSub Development Plan](https://github.com/Azure/azure-webpubsub/blob/main/docs/specs/development-plan.md)

- [ ] **Phase 1** Support simple websocket clients
  - [X] Binding/Trigger support
  - [X] csharp version e2e
  - [ ] javascript version e2e
  - [ ] Both binary/string type of message supports
  - [ ] Data plane SDK integration instead of function side construct rest api.
  - [ ] Separate Request/Response from generic `InvocationContext` for all kinds of Events (Connect, **Connected**, Disconnect, Message)

- [ ] **Phase 2** Support subprotocol websocket clients

- [ ] **Portal Support** Azure Portal integration for a easy create/configure Azure Functions for Web PubSub service.

> Subprotocol de-serialization is done by service side. Server will have a consistent `Event` property to understand the request. So not much gap between phase 1 & 2 in function side.

## Usage

### Create Azure Web PubSub Service instance
...

### Using the WebPubSubConnection input binding

In anonymous mode, `UserId` can be used with {headers.userid} or {query.userid} depends on where the userid is assigned in the negotiate call.

__Optional__ Similarly users can set customers generated JWT accesstoken by assign `AccessToken = {query.accesstoken}` in the input binding property on demand where customized claims are built with. 

* csharp usage:
```cs
[FunctionName("login")]
public static WebPubSubConnection GetClientConnection(
    [HttpTrigger(AuthorizationLevel.Anonymous, "get", "post")] HttpRequest req,
    [WebPubSubConnection(HubName = "chathub", UserId = "{query.userid}")] WebPubSubConnectioconnection,
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
      "hubName": "chathub",
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

When clients already know Web PubSub service and communication to service, `WebPubSubTrigger` can be used as listerner towards all kinds of requests coming from service. To have a consistent routing logic that needs to configure in service side (Resource Provider), `FunctionName` will be used as the unique key to match upstream events. Rule is `<hub>-<event>` works for user defined hubs.

For a connect request, server side has some controls to manager user's authentication before connected. Future on-hold messages can also be used like this. Properties available to set will be opened in `InvocationContext` and function extension will help build correct response to service after user actions are done in function.

* csharp usage:
```cs
[FunctionName("chathub-connect")]
public static void Connect(
[WebPubSubTrigger]InvocationContext context)
{
    Console.WriteLine($"{context.ConnectionId}");
    Console.WriteLine("Connect.");
    if (context.UserId == "abc")
    {
        // some further check
        context.StatusCode = System.Net.HttpStatusCode.Unauthorized;
        // or set roles
        context.Roles = new string[] { "Admin" };
    }
}
```

* javascript usage:
```js
{
  "type": "webpubsubTrigger",
  "name": "invocation",
  "direction": "in"
}
```

```js
module.exports = function (context, invocation) {
  context.log('Receive event: ${context.bindingData.event} from connection: ${context.bindingData.connectionId}.');
  context.done();
};
```

### Using the WebPubSub output binding

For single message request, customer could bind to a target operation related data type to send the request.

* csharp usage:
```cs
[FunctionName("chathub-message")]
[return: WebPubSub]
public static MessageData Broadcast(
    [WebPubSubTrigger] InvocationContext context)
{
    return new MessageData
    {
        Message = GetString(context.Payload.Span)
    };
}
```
* javascript usage:
```js
{
  "type": "webpubsubTrigger",
  "name": "invocation",
  "direction": "in"
},
{
  "type": "webpubsub",
  "name": "messageData",
  "hubName": "<hub_name>",
  "connectionStringSetting": "<name of setting containing SignalR Service connection string>",
  "direction": "out"
}
```
```js
module.exports = async function (context, invocation) {
    context.bindings.messageData = [{
        "message": invocation.bindingData.payload
    }];
    context.
};
```

To send multiple messages, customer need to work with generic `WebPubSubEvent` and do multiple tasks in order.

* csharp usage:
```cs
[FunctionName("chathub-message")]
public static async Task Message(
    [WebPubSubTrigger] InvocationContext context,
    [WebPubSub] IAsyncCollector<WebPubSubEvent> eventHandler)
{
    await message.AddAsync(new GroupData
    {
        Action = GroupAction.Join,
        TargetType = TargetType.Users,
        TargetId = context.UserId,
        GroupId = "group1",
    })
    await message.AddAsync(new MessageData
    {
        Message = GetString(context.Payload.Span)
    });
}
```

> When SDK has better supports, server side could work with server sdk convenience layer methods without output binding data type limited. And method response will have enrich properties.
> ```cs
> [FunctionName("chathub-message")]
> public static async Task Message(
>     [WebPubSubTrigger] InvocationContext context)
> {
>     var server = context.GetWebPubSubServer();
>     await server.AddToGroupAsync(context.UserId, "group1");
>     await server.SendAsync(context.Payload);
> }
> ```

### Supported object types for Output bindings.

#### WebPubSubEvent (Generic base class)

#### MessageData

1. `TargetType`, supports All, Users, Connections, Groups, default as All
2. `TargetId`, use with `TagetType`, where target id should be assigned if `TargetType` is not All.
3. `Excludes`, excludes connection ids
4. `Message`

#### GroupData

1. `GroupAction`, supports Add/Remove
2. `TargetType`, supports Users/Connections
3. `TargetId`
4. `GroupId`

#### CloseConnectionData

1. `ConnectionId`
2. `Reason`

#### ExistenceData (Limited)

1. `TargetType` supports Users/Connections/Groups
2. `TargetId`

> Response result is not able to reflect. May not be supported in the initial version.