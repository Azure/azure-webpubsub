using Newtonsoft.Json;

namespace Microsoft.Azure.WebPubSub.CloudEvents
{
    public class DisconnectEventRequest
    {
        [JsonProperty("reason")]
        public string Reason { get; set; }
        public DisconnectEventRequest(string reason)
        {
            Reason = reason;
        }
    }
}
