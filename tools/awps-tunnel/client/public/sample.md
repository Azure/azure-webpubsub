# JavaScript
**1. Install the package:**

```bash
npm install @azure/web-pubsub-express
```

**2. Use `WebPubSubEventHandler`**

```js
const app = express();
const handler = new WebPubSubEventHandler(hub, {
  path: path,
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

**1. Install the package:**

```bash
dotnet add package Microsoft.Azure.WebPubSub.AspNetCore
```

**2. Use `MapWebPubSubHub`**

In `Program.cs`:

```csharp
using Microsoft.Azure.WebPubSub.AspNetCore;
using Microsoft.Azure.WebPubSub.Common;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddWebPubSub();

var app = builder.Build();

app.UseRouting();

app.UseEndpoints(endpoints =>
{
    endpoints.MapWebPubSubHub<Chat>("/eventhandler/{*path}");
});

app.Run();

class Chat : WebPubSubHub
{
    public override async ValueTask<ConnectEventResponse> OnConnectAsync(ConnectEventRequest request, CancellationToken cancellationToken)
    {
        Console.WriteLine("Connect triggered");
        return new ConnectEventResponse();
    }

    public override async ValueTask<UserEventResponse> OnMessageReceivedAsync(UserEventRequest request, CancellationToken cancellationToken)
    {
        return request.CreateResponse(request.Data, request.DataType);
    }

    public override async Task OnConnectedAsync(ConnectedEventRequest request)
    {
        Console.WriteLine("Connected triggered");
    }

    public override async Task OnDisconnectedAsync(DisconnectedEventRequest request)
    {
        Console.WriteLine("Diesconnected triggered");
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