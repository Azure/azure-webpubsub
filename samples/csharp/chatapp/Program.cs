using Microsoft.Azure.WebPubSub.AspNetCore;
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
