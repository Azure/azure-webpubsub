# JavaScript

Following the steps:
1. Install the package:

```bash
npm install @azure/web-pubsub-express
```

2. Use `WebPubSubEventHandler`

```js
const app = express();
const handler = new WebPubSubEventHandler(hub, {
  path: path,
  handleConnect(_, res) {
    logger.info(`Connect triggered`);
    res.success();
  },
  handleUserEvent(_, res) {
    logger.info(`User event triggered`);
    res.success();
  },
  onConnected() {
    logger.info(`Connected triggered`);
  },
  onDisconnected() {
    logger.info(`Disconnected triggered`);
  },
});
app.use(handler.getMiddleware());

```

# C#
```csharp
app.UseEndpoints(endpoints =>
{
    endpoints.MapGet("/negotiate", async  (WebPubSubServiceClient<Sample_ChatApp> serviceClient, HttpContext context) =>
    {
        var id = context.Request.Query["id"];
        if (id.Count != 1)
        {
            context.Response.StatusCode = 400;
            await context.Response.WriteAsync("missing user id");
            return;
        }
        await context.Response.WriteAsync(serviceClient.GetClientAccessUri(userId: id).AbsoluteUri);
    });

    endpoints.MapWebPubSubHub<Sample_ChatApp>("/eventhandler/{*path}");
});
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