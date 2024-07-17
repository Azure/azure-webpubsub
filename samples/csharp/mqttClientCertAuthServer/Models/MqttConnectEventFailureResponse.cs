using Newtonsoft.Json;

namespace Microsoft.Azure.WebPubSub.CloudEvents;

#nullable enable

public class MqttConnectEventFailureResponse : MqttConnectEventResponse
{
    [JsonProperty("mqtt")]
    public MqttConnectEventFailureResponseProperties Mqtt { get; init; }
}

public class MqttConnectEventFailureResponseProperties
{
    [JsonProperty("code")]
    public required int Code { get; set; }

    [JsonProperty("reason")]
    public string? Reason { get; set; }

    [JsonProperty("userProperties")]
    [JsonConverter(typeof(MqttUserPropertyJsonConverter))]
    public IReadOnlyList<MqttUserProperty>? UserProperties { get; init; }
}