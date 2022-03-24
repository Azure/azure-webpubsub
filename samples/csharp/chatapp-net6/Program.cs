using Microsoft.Azure.WebPubSub.AspNetCore;
using Microsoft.Azure.WebPubSub.Common;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddWebPubSub(
    o => o.ServiceEndpoint = new ServiceEndpoint(builder.Configuration["Azure:WebPubSub:ConnectionString"]))
    .AddWebPubSubServiceClient<Sample_ChatApp>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}

app.UseStaticFiles();
app.UseRouting();

app.UseEndpoints(endpoints =>
{    
    endpoints.MapGet("/negotiate", async (WebPubSubServiceClient<Sample_ChatApp> serviceClient, HttpContext context) =>
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

app.Run();

sealed class Sample_ChatApp : WebPubSubHub
{
    private readonly WebPubSubServiceClient<Sample_ChatApp> _serviceClient;

    public Sample_ChatApp(WebPubSubServiceClient<Sample_ChatApp> serviceClient)
    {
        _serviceClient = serviceClient;
    }

    public override async Task OnConnectedAsync(ConnectedEventRequest request)
    {
        await _serviceClient.SendToAllAsync($"[SYSTEM] {request.ConnectionContext.UserId} joined.");
    }

    public override async ValueTask<UserEventResponse> OnMessageReceivedAsync(UserEventRequest request, CancellationToken cancellationToken)
    {
        await _serviceClient.SendToAllAsync($"[{request.ConnectionContext.UserId}] {request.Data}");

        return request.CreateResponse($"[SYSTEM] ack.");
    }
}
