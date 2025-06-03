#nullable enable

public class MqttConnectEventSuccessResponse : MqttConnectEventResponse
{
    public string[]? Roles { get; set; }

    public string? Subprotocol { get; init; }

    public string? UserId { get; set; }

    public string[]? Groups { get; set; }

    public MqttConnectEventSuccessResponseProperties? Mqtt { get; init; }
}

public class MqttConnectEventSuccessResponseProperties
{

    public IReadOnlyList<MqttUserProperty>? UserProperties { get; init; }
}