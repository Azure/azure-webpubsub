# JavaScript

**0. Prerequisites:**

In Azure portal, configure your hub settings to set upstream URL to `tunnel:///eventhandler`.

**1. Install the package:**

```bash
npm install @azure/web-pubsub-express
```

**2. Use `WebPubSubEventHandler`**

```js
const app = express();
const handler = new WebPubSubEventHandler(hub, {
  path: "/eventhandler",
  handleConnect(_, res) {
    console.log(`Connect triggered`);
    res.success();
  },
  handleUserEvent(req, res) {
    console.log(`User event triggered`);
    if (req.dataType === "text") {
      res.success(`Echo back ${req.data}`, req.dataType);
    } else if (req.dataType === "json") {
      res.success(`Echo back: ${JSON.stringify(req.data)}`, req.dataType);
    } else {
      res.success(req.data, req.dataType);
    }
  },
  onConnected() {
    console.log(`Connected triggered`);
  },
  onDisconnected() {
    console.log(`Disconnected triggered`);
  },
});
app.use(handler.getMiddleware());
app.listen(8080, () => {});
```

# C#

**0. Prerequisites:**
* In Azure portal, configure your hub settings to set upstream URL to `tunnel:///eventhandler`.
* [ASP.NET Core 8](https://learn.microsoft.com/aspnet/core)

**1. Install the package:**

```bash
dotnet add package Microsoft.Azure.WebPubSub.AspNetCore
```

**2. Use `MapWebPubSubHub`**

The below sample shows how to handle hub `chat` (hub is case-insensitive). Don't forget to rename the `Chat` class to your hub name.

In `Program.cs`:

```csharp
using Microsoft.Azure.WebPubSub.AspNetCore;
using Microsoft.Azure.WebPubSub.Common;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddWebPubSub();

var app = builder.Build();

app.MapWebPubSubHub<Chat>("/eventhandler/{*path}");

app.Run();

class Chat : WebPubSubHub
{
    public override ValueTask<ConnectEventResponse> OnConnectAsync(ConnectEventRequest request, CancellationToken cancellationToken)
    {
        Console.WriteLine("Connect triggered");
        return new ValueTask<ConnectEventResponse>(new ConnectEventResponse());
    }

    public override ValueTask<UserEventResponse> OnMessageReceivedAsync(UserEventRequest request, CancellationToken cancellationToken)
    {
        return new ValueTask<UserEventResponse>(request.CreateResponse(request.Data, request.DataType));
    }

    public override Task OnConnectedAsync(ConnectedEventRequest request)
    {
        Console.WriteLine("Connected triggered");
        return Task.CompletedTask;
    }

    public override Task OnDisconnectedAsync(DisconnectedEventRequest request)
    {
        Console.WriteLine("Disconnected triggered");
        return Task.CompletedTask;
    }
}
```

# Java

https://learn.microsoft.com/en-us/azure/azure-web-pubsub/tutorial-build-chat?tabs=java

```java
// validation: https://azure.github.io/azure-webpubsub/references/protocol-cloudevents#validation
app.options("/eventhandler", ctx -> {
    ctx.header("WebHook-Allowed-Origin", "*");
});

// handle events: https://azure.github.io/azure-webpubsub/references/protocol-cloudevents#events
app.post("/eventhandler", ctx -> {
    String event = ctx.header("ce-type");
    if ("azure.webpubsub.sys.connected".equals(event)) {
        String id = ctx.header("ce-userId");
        System.out.println(id + " connected.");
    }
    ctx.status(200);
});
```