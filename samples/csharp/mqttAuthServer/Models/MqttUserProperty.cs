namespace Microsoft.Azure.WebPubSub.CloudEvents;

public record MqttUserProperty
{
    public string Name { get; init; }

    public string Value { get; init; }
}