using Microsoft.Azure.WebPubSub.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddWebPubSub(
    o => o.ServiceEndpoint = new ServiceEndpoint(builder.Configuration["Azure:WebPubSub:ConnectionString"]))
    .AddWebPubSubServiceClient<SampleChatHub>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRouting();

app.UseEndpoints(endpoints =>
{    
    endpoints.MapGet("/negotiate", async  (WebPubSubServiceClient<SampleChatHub> serviceClient, HttpContext context) =>
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

    endpoints.MapWebPubSubHub<SampleChatHub>("/eventhandler/{*path}");
});

app.Run();
