namespace Microsoft.Azure.WebPubSub.CloudEvents;

public class ConnectEventRequest
{
    public IDictionary<string, string[]> Claims { get; init; } = new Dictionary<string, string[]>();

    public IDictionary<string, string[]> Query { get; init; } = new Dictionary<string, string[]>();

    public IDictionary<string, string[]> Headers { get; init; } = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);

    public string[] Subprotocols { get; init; }

    public ClientCertificateInfo[] ClientCertificates { get; init; }

    public ConnectEventRequest()
    {
    }
}
