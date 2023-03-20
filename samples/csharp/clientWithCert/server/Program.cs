
using Microsoft.Azure.WebPubSub.AspNetCore;
using Microsoft.Azure.WebPubSub.Common;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddWebPubSub();
var app = builder.Build();
app.UseRouting();
app.UseEndpoints(endpoint =>
{
    endpoint.MapWebPubSubHub<Cert>("/eventhandler");
});

app.Run();

sealed class Cert : WebPubSubHub
{
    public override ValueTask<ConnectEventResponse> OnConnectAsync(ConnectEventRequest request, CancellationToken cancellationToken)
    {
        Console.WriteLine("Client cert thumbprint: " + request.ClientCertificates.FirstOrDefault()?.Thumbprint);
        Console.WriteLine("Client query query1: " + request.Query["query1"]);
        var response = new ConnectEventResponse
        {
            UserId = request.ConnectionContext.UserId
        };
        return new ValueTask<ConnectEventResponse>(response);
    }
}