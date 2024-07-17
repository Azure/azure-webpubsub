using Newtonsoft.Json;

namespace Microsoft.Azure.WebPubSub.CloudEvents;

#nullable enable

public class MqttConnectEventSuccessResponse : MqttConnectEventResponse
{
    [JsonProperty("roles")]
    public string[]? Roles { get; set; }

    [JsonProperty("subprotocol")]
    public string? Subprotocol { get; init; }

    [JsonProperty("userId")]
    public string? UserId { get; set; }

    [JsonProperty("groups")]
    public string[]? Groups { get; set; }

    [JsonProperty("mqtt")]
    public MqttConnectEventSuccessResponseProperties? Mqtt { get; init; }
}

public class MqttConnectEventSuccessResponseProperties
{
    [JsonProperty("userProperties")]
    [JsonConverter(typeof(MqttUserPropertyJsonConverter))]
    public IReadOnlyList<MqttUserProperty>? UserProperties { get; init; }
}