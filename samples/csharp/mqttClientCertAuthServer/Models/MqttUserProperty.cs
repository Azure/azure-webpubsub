namespace Microsoft.Azure.WebPubSub.CloudEvents;

public record MqttUserProperty
{
    [JsonProperty("name")]
    public string Name { get; init; }
    [JsonProperty("value")]
    public string Value { get; init; }
}