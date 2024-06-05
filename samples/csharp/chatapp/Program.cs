using Azure.Core;
using Microsoft.Azure.WebPubSub.AspNetCore;
using Microsoft.Azure.WebPubSub.Common;
using Microsoft.Extensions.Primitives;

// Read connection string from environment
var connectionString = Environment.GetEnvironmentVariable("WebPubSubConnectionString");
if (connectionString == null)
{
    throw new ArgumentNullException(nameof(connectionString));
}

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddWebPubSub(o => o.ServiceEndpoint = new WebPubSubServiceEndpoint(connectionString))
    .AddWebPubSubServiceClient<Sample_ChatApp>();
var app = builder.Build();

app.UseStaticFiles();

// return the Client Access URL with negotiate endpoint
app.MapGet("/negotiate", (WebPubSubServiceClient<Sample_ChatApp> service, HttpContext context) =>
{
    var id = context.Request.Query["id"];
    if (StringValues.IsNullOrEmpty(id))
    {
        context.Response.StatusCode = 400;
        return null;
    }
    return new
    {
        url = service.GetClientAccessUri(userId: id).AbsoluteUri
    };
});

app.MapWebPubSubHub<Sample_ChatApp>("/eventhandler/{*path}");
app.Run();

sealed class Sample_ChatApp : WebPubSubHub
{
    private readonly WebPubSubServiceClient<Sample_ChatApp> _serviceClient;

    public Sample_ChatApp(WebPubSubServiceClient<Sample_ChatApp> serviceClient)
    {
        _serviceClient = serviceClient;
    }

    public override Task OnConnectedAsync(ConnectedEventRequest request)
    {
        Console.WriteLine($"[SYSTEM] {request.ConnectionContext.UserId} joined.");
        return Task.CompletedTask;
    }

    public override async ValueTask<UserEventResponse> OnMessageReceivedAsync(UserEventRequest request, CancellationToken cancellationToken)
    {
        await _serviceClient.SendToAllAsync(RequestContent.Create(
        new
        {
            from = request.ConnectionContext.UserId,
            message = request.Data.ToString()
        }),
        ContentType.ApplicationJson);

        return new UserEventResponse();
    }
}