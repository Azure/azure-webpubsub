using Azure.Messaging.WebPubSub;

using Microsoft.Extensions.Azure;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddAzureClients(s =>
{
    s.AddWebPubSubServiceClient(builder.Configuration["Azure:WebPubSub:ConnectionString"], "sample_stream");
});

var app = builder.Build();
app.UseStaticFiles();
app.MapGet("/negotiate", async context =>
{
    var service = context.RequestServices.GetRequiredService<WebPubSubServiceClient>();
    var response = new
    {
        url = service.GetClientAccessUri(roles: new string[] { "webpubsub.sendToGroup.stream", "webpubsub.joinLeaveGroup.stream" }).AbsoluteUri
    };
    await context.Response.WriteAsJsonAsync(response);
});

app.Run();
