using Newtonsoft.Json;

namespace Microsoft.Azure.WebPubSub.CloudEvents
{
    public class ConnectEventRequest
    {
        [JsonProperty("claims")]
        public IDictionary<string, string[]> Claims { get; init; } = new Dictionary<string, string[]>();

        [JsonProperty("query")]
        public IDictionary<string, string[]> Query { get; init; } = new Dictionary<string, string[]>();

        [JsonProperty("headers")]
        public IDictionary<string, string[]> Headers { get; init; } = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);

        [JsonProperty("subprotocols")]
        public string[] Subprotocols { get; init; }

        [JsonProperty("clientCertificates")]
        public ClientCertificateInfo[] ClientCertificates { get; init; }

        public ConnectEventRequest()
        {
        }
    }
}
