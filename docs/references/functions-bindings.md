---
layout: docs
title: Functions Bindings
group: references
toc: true
---

# Azure Web PubSub bindings for Azure Functions

## Overview

This reference explains how to handle Web PubSub events in Azure Functions.

Web PubSub is an Azure-managed service that helps developers easily build web applications with real-time features and publish-subscribe pattern.

| Action | Type |
|---------|---------|
| Run a function when messages comes from service | [Trigger](#trigger-binding) |
| Return the service endpoint URL and access token | [Input binding](#input-binding)
| Send Web PubSub messages |[Output binding](#output-binding) |

### Add to your Functions app

#### Functions 2.x and higher

Working with the trigger and bindings requires that you reference the appropriate package. The NuGet package is used for .NET class libraries while the extension bundle is used for all other application types.

| Language                                        | Add by...                                   | Remarks 
|-------------------------------------------------|---------------------------------------------|-------------|
| C#                                              | Installing the [NuGet package], version 2.x | |
| C# Script, Java, JavaScript, Python, PowerShell | Registering the [extension bundle]          | The [Azure Tools extension] is recommended to use with Visual Studio Code. |
| C# Script (online-only in Azure portal)         | Adding a binding                            | To update existing binding extensions without having to republish your function app, see [Update your extensions]. |

[NuGet package]: https://www.nuget.org/packages/Microsoft.Azure.WebJobs.Extensions.WebPubSub
[extension bundle]: https://docs.microsoft.com/azure/azure-functions/functions-bindings-register#extension-bundles 
[Azure Tools extension]: https://marketplace.visualstudio.com/items?itemName=ms-vscode.vscode-node-azure-pack
[Update your extensions]: https://docs.microsoft.com/azure/azure-functions/functions-bindings-register

## Trigger binding

Use the function trigger to handle request from Azure Web PubSub service. For information on setup and configuration details, see the [overview](#overview).

### Example

#### C#

```cs
[FunctionName("WebPubSubTest")]
public static async Task<MessageResponse> Run(
    [WebPubSubTrigger("message", EventType.User)] 
    ConnectionContext context,
    string message,
    MessageDataType dataType)
{
    Console.WriteLine($"Request from: {context.userId}");
    Console.WriteLine($"Request message: {message}");
    Console.WriteLine($"Request message DataType: {dataType}");
    return new MessageResponse
    {
        Message = BinaryData.FromString("ack"),
    };
}
```
#### Attributes and annotations

In [C# class libraries](https://docs.microsoft.com/azure/azure-functions/functions-dotnet-class-library), use the WebPubSubTrigger attribute.

Here's an `WebPubSubTrigger` attribute in a method signature:

```csharp
[FunctionName("WebPubSubTest")]
public static void WebPubSubTest([WebPubSubTrigger] 
ConnectionContext context, ILogger log)
{
    ...
}
```

For a complete example, see C# example.

#### Configuration

The following table explains the binding configuration properties that you set in the *function.json* file.

| function.json property | Attribute property | Description |
|---------|---------|---------|
| **type** | n/a |Required - must be set to `webPubSubTrigger`. |
| **direction** | n/a | Required - must be set to `in`. |
| **name** | n/a | Required - the variable name used in function code for the parameter that receives the event data. |
| **hub** | Hub | Required - the value must be set to the name of the Web PubSub hub for the function to be triggered. We support set the value in attribute as higher priority, or it can be set in app settings as a global value. |
| **eventType** | EventType | Required - the value must be set as the event type of messages for the function to be triggered. The value should be either `user` or `system`. |
| **eventName** | EventName | Required - the value must be set as the event of messages for the function to be triggered. </br> For `system` event type, the event name should be in `connect`, `connected`, `disconnect`. </br> For system supported subprotocol `json.webpubsub.azure.v1.`, the event name is user defined event name. </br> For user defined subprotocols, the event name is `message`. |

#### Usages

In C#, `ConnectionContext` is type recognized binding parameter, rest parameters are binded by parameter name. Check table below of available paramters and types.

In non-csharp like javascript, `name` in `function.json` will be used to bind the trigger object regarding below mapping table. And will repect `dataType` in `function.json` to convert message accordingly when `name` is set to `message` as the binding object for trigger input. All the parameters can be get by `context.bindingData.<BindingName>` and will be `JObject` converted. 

| Binding Name | Binding Type | Description | Properties |
|---------|---------|---------|---------|
|connectionContext|`ConnectionContext`|Common request information| EventType, EventName, Hub, ConnectionId, UserId, Headers, Signature |
|message|`BinaryData`,`string`,`Stream`,`byte[]`| Request message from client | -|
|dataType|`MessageDataType`| Request message dataType, supports `binary`, `text`, `json` | -|
|claims|`IDictionary<string, string[]>`|User Claims in `connect` request | -|
|subprotocols|`string[]`|Available subprotocols in `connect` request | -|
|clientCertificates|`ClientCertificate[]`|A list of certificate thumbprint from clients in `connect` request|-|
|reason|`string`|Reason in disconnect request|-|

#### Return response

`WebPubSubTrigger` will respect customer returned response for synchronous events of `connect` and user event `message`. Only matched response will be sent back to service, otherwise, it will be ignored. 

| Return Type | Description | Properties |
|---------|---------|---------|
|`ConnectResponse`| Response for `connect` event | Groups, Roles, UserId, Subprotocol |
|`MessageResponse`| Response for user event | DataType, Message |
|`ErrorResponse`| Error response for the sync event | Code, ErrorMessage |
|`ServiceResponse`| Base response type of the supported ones used for uncertain return cases | - |

## Input binding

In order to let a client connect to Azure Web PubSub Service, it must know the service endpoint URL and a valid access token. The `WebPubSubConnection` input binding produces required information so client doesn't need to handle this themselves. Because the token is time-limited and can be used to authenticate a specific user to a connection, you should not cache the token or share it between clients. An HTTP trigger working with this input binding can be used for clients to retrieve the connection information.

### Example

The following example shows a C# function that acquires Web PubSub connection information using the input binding and returns it over HTTP.

```cs
[FunctionName("login")]
public static WebPubSubConnection GetClientConnection(
    [HttpTrigger(AuthorizationLevel.Anonymous, "get", "post")] HttpRequest req,
    [WebPubSubConnection(Hub = "simplechat", UserId = "{query.userid}")] WebPubSubConnection connection)
{
    Console.WriteLine("login");
    return connection;
}
```

### Authenticated **tokens**

If the function is triggered by an authenticated client, you can add a user ID claim to the generated token. You can easily add authentication to a function app using App Service Authentication.

App Service Authentication sets HTTP headers named `x-ms-client-principal-id` and `x-ms-client-principal-name` that contain the authenticated user's client principal ID and name, respectively.

You can set the UserId property of the binding to the value from either header using a binding expression: `{headers.x-ms-client-principal-id}` or `{headers.x-ms-client-principal-name}`.

```cs
[FunctionName("login")]
public static WebPubSubConnection GetClientConnection(
    [HttpTrigger(AuthorizationLevel.Anonymous, "get", "post")] HttpRequest req,
    [WebPubSubConnection(Hub = "simplechat", UserId = "{headers.x-ms-client-principal-name}")] WebPubSubConnection connection)
{
    Console.WriteLine("login");
    return connection;
}
```
### Configuration

#### WebPubSubConnection

The following table explains the binding configuration properties that you set in the function.json file and the `WebPubSubConnection` attribute.

| function.json property | Attribute property | Description |
|---------|---------|---------|
| **type** | n/a | Must be set to `webPubSub` |
| **direction** | n/a | Must be set to `out` |
| **name** | n/a | Variable name used in function code for input connection binding object. |
| **hub** | Hub | The value must be set to the name of the Web PubSub hub for the function to be triggered. We support set the value in attribute as higher priority, or it can be set in app settings as a global value. |
| **userId** | UserId | Optional - the value of the user identifier claim to be set in the access key token. |
| **connectionStringSetting** | ConnectionStringSetting | The name of the app setting that contains the Web PubSub Service connection string (defaults to "WebPubSubConnectionString") |

## Output binding

Use the Web PubSub output binding to send one or more messages using Azure Web PubSub Service. You can broadcast a message to:

* All connected clients
* Connected clients authenticated to a specific user

The output binding also allows you to manage groups.

For information on setup and configuration details, see the overview.

### Example

```cs
[FunctionName("broadcast")]
public static async Task Broadcast(
    [HttpTrigger(AuthorizationLevel.Anonymous, "get", "post")] HttpRequest req,
    [WebPubSub(Hub = "simplechat")] IAsyncCollector<WebPubSubOperation> operations)
{
    await operations.AddAsync(new SendToAll
    {
        Message = BinaryData.FromString("Hello Web PubSub"),
        DataType = MessageDataType.Text
    });
}
```

### WebPubSubOperation 

`WebPubSubOperation` is the base abstract type of output bindings. The derived types represents the operation server want to services to invoke. In type-less language like `javascript`, `OperationKind` is the key parameter to resolve the type. And under strong type language like `csharp`, user can new the target operation type directly and `OperationKind` would be ignored.

Derived Class|Properties
--|--
`SendToAll`|Message, DataType, Excluded
`SendToGroup`|Group, Message, DataType, Excluded
`SendToUser`|UserId, Message, DataType
`SendToConnection`|ConnectionId, Message, DataType
`AddUserToGroup`|UserId, Group
`RemoveUserFromGroup`|UserId, Group
`RemoveUserFromAllGroups`|UserId
`AddConnectionToGroup`|ConnectionId, Group
`RemoveConnectionFromGroup`|ConnectionId, Group
`CloseClientConnection`|ConncectionId, Reason
`GrantGroupPermission`|ConnectionId, Group, Permission
`RevokeGroupPermission`|ConnectionId, Group, Permission

### Configuration

#### WebPubSub

The following table explains the binding configuration properties that you set in the function.json file and the `WebPubSub` attribute.

| function.json property | Attribute property | Description |
|---------|---------|---------|
| **type** | n/a | Must be set to `webPubSub` |
| **direction** | n/a | Must be set to `out` |
| **name** | n/a | Variable name used in function code for output binding object. |
| **hub** | Hub | The value must be set to the name of the Web PubSub hub for the function to be triggered. We support set the value in attribute as higher priority, or it can be set in app settings as a global value. |
| **connectionStringSetting** | ConnectionStringSetting | The name of the app setting that contains the Web PubSub Service connection string (defaults to "WebPubSubConnectionString") |