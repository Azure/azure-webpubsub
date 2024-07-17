
using Newtonsoft.Json;

namespace Microsoft.Azure.WebPubSub.CloudEvents
{
    public sealed class ClientCertificateInfo
    {
        [JsonProperty("thumbprint")]
        public string Thumbprint { get; set; }

        [JsonProperty("content")]
        public string Content { get; set; }
    }
}
