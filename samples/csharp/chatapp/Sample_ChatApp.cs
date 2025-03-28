using Azure.Core;

using Microsoft.Azure.WebPubSub.AspNetCore;
using Microsoft.Azure.WebPubSub.Common;

sealed class Sample_ChatApp(WebPubSubServiceClient<Sample_ChatApp> serviceClient) : WebPubSubHub
{
    public override Task OnConnectedAsync(ConnectedEventRequest request)
    {
        Console.WriteLine($"[SYSTEM] {request.ConnectionContext.UserId} joined.");
        return Task.CompletedTask;
    }

    public override async ValueTask<UserEventResponse> OnMessageReceivedAsync(UserEventRequest request, CancellationToken cancellationToken)
    {
        await serviceClient.SendToAllAsync(RequestContent.Create(
        new
        {
            from = request.ConnectionContext.UserId,
            message = request.Data.ToString()
        }),
        ContentType.ApplicationJson);

        return new UserEventResponse();
    }
}