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
    Message message,
    MessageDataType dataType)
{
    Console.WriteLine($"Request from: {context.userId}");
    Console.WriteLine($"Request message: {message.Body.ToString()}");
    Console.WriteLine($"Request message DataType: {dataType}");
    return new MessageResponse
    {
        Message = new WebPubSubMessage("ack"),
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
|connectionContext|`ConnectionContext`|Common request information| Type, Event, Hub, ConnectionId, UserId, Headers, Queries, Claims, MediaType|
|message|`Message`,`string`,`Stream`,`byte[]`|Request message content of `BinaryData` type| -|
|dataType|`MessageDataType`| Request message dataType | -|
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
    [WebPubSub(Hub = "simplechat")] IAsyncCollector<WebPubSubEvent> webpubsubEvent)
{
    await webpubsubEvent.AddAsync(new WebPubSubEvent
    {
        Operation = Operation.SendToAll,
        Message = new Message("Hello Web PubSub"),
        DataType = MessageDataType.Text
    });
}
```

### WebPubSubEvent 

`WebPubSubEvent` is the the object contains all the properties user can set to invoke rest calls to service. Among the properties, `Operation` is required which matches rest api method names in swagger file. `Operation`s listed below are supported. Rest fields should be set depends on the operation type, and will fail if missed or with wrong values.

Name|Type|IsRequired|Description
--|--|--|--
Operation|`Operation`|True|SendToAll</br>CloseClientCOnnection</br>SendToConnection</br>SendTOGroup</br>AddConnectionToGroup</br>RemoveConnectionFromGroup</br>SendToUser</br>AddUserToGroup</br>RemoveUserFromGroup</br>RemoveUserFromAllGroups</br>GrantGroupPermission</br>RevokeGroupPermission</br>
Group|`string`|False|Group in operations related to groups
UserId|`string`|False|User id in operations related to user
ConnectionId|`string`|False|Connection id in operations related to connection
Excluded|`string[]`|False|List of connection to exlude in operations like SendToAll and SendToGroup
Reason|`string`|False|Optional reason when function need to close connection
Permission|`WebPubSubPermission`|False|Permission need to grant/revoke, supports `SendToGroup` and `JoinLeaveGroup`
Message|`Message`|False|Message to send in the send operations
DataType|`MessageDataType`|False|Message data type

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

