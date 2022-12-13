using Microsoft.Azure.WebPubSub.AspNetCore;
using Microsoft.Azure.WebPubSub.Common;
using Microsoft.Azure.WebPubSub.Samples;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddWebPubSub(
    o => o.ServiceEndpoint = new ServiceEndpoint(builder.Configuration["Azure:WebPubSub:ConnectionString"]))
    .AddWebPubSubServiceClient<Sample_ChatWithStorageHub>();

builder.Services.AddSingleton<IChatHandler, AzureTableChatStorage>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}

app.UseDefaultFiles().UseStaticFiles();
app.UseRouting();
app.UseEndpoints(endpoints =>
{    
    endpoints.MapGet("/negotiate", async (WebPubSubServiceClient<Sample_ChatWithStorageHub> serviceClient, HttpContext context) =>
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

    endpoints.MapWebPubSubHub<Sample_ChatWithStorageHub>("/eventhandler/{*path}");
});

app.Run();
