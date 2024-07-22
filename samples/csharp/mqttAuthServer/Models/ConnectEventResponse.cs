namespace Microsoft.Azure.WebPubSub.CloudEvents;

public sealed class ConnectEventResponse
{
    public string Subprotocol { get; set; }

    public string[] Roles { get; set; }

    public string UserId { get; set; }

    public string[] Groups { get; set; }
}
