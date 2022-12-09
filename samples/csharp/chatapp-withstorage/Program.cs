using Microsoft.Azure.SignalR.Samples.ReliableChatRoom;
using Microsoft.Azure.WebPubSub.AspNetCore;
using Microsoft.Azure.WebPubSub.Common;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddWebPubSub(
    o => o.ServiceEndpoint = new ServiceEndpoint(builder.Configuration["Azure:WebPubSub:ConnectionString"]))
    .AddWebPubSubServiceClient<Sample_ReliableChatApp>();

builder.Services.AddSingleton<ISessionHandler, InMemorySessionStorage>(); 
builder.Services.AddSingleton<IChatHandler, InMemoryChatHandler>();
builder.Services.AddSingleton<IUserManager, InMemoryUserManager>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}

app.UseStaticFiles();
app.UseRouting();

app.UseEndpoints(endpoints =>
{    
    endpoints.MapGet("/negotiate", async (WebPubSubServiceClient<Sample_ReliableChatApp> serviceClient, HttpContext context) =>
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

    endpoints.MapWebPubSubHub<Sample_ReliableChatApp>("/eventhandler/{*path}");
});

app.Run();
