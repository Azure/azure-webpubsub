

#nullable enable

public class MqttConnectEventFailureResponse : MqttConnectEventResponse
{
    public MqttConnectEventFailureResponseProperties Mqtt { get; init; }
    public MqttConnectEventFailureResponse(MqttConnectEventFailureResponseProperties mqtt)
    {
        Mqtt = mqtt;
    }
}

public class MqttConnectEventFailureResponseProperties
{
    public required int Code { get; set; }

    public string? Reason { get; set; }

    public IReadOnlyList<MqttUserProperty>? UserProperties { get; init; }
}