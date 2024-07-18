using Newtonsoft.Json;

namespace Microsoft.Azure.WebPubSub.CloudEvents
{
    public sealed class ConnectEventResponse
    {
        [JsonProperty("subprotocol")]
        public string Subprotocol { get; set; }

        [JsonProperty("roles")]
        public string[] Roles { get; set; }

        [JsonProperty("userId")]
        public string UserId { get; set; }

        [JsonProperty("groups")]
        public string[] Groups { get; set; }
    }
}
