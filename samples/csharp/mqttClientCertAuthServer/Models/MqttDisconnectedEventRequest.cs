using Newtonsoft.Json;

namespace Microsoft.Azure.WebPubSub.CloudEvents;

#nullable enable

public class MqttDisconnectedEventRequest(string? reason, DisconnectedEventMqttProperties mqtt) : DisconnectEventRequest(reason)
{
    [JsonProperty("mqtt")]
    public DisconnectedEventMqttProperties Mqtt { get; set; } = mqtt;
}
public class DisconnectedEventMqttProperties
{
    /// <summary>
    /// Indicates whether the disconnection is closed by the client.
    /// </summary>
    [JsonProperty("initiatedByClient")]
    public bool InitiatedByClient { get; set; }

    /// <summary>
    /// The DISCONNECT package to end the last physical connection. It may be sent by client or server.
    /// </summary>
    [JsonProperty(propertyName: "disconnectPacket")]

    public MqttDisconnectPacketProperties? DisconnectPacket { get; set; }
}
public class MqttDisconnectPacketProperties
{
    /// <summary>
    /// The DISCONNECT reason code defined in MQTT 5.0 spec. For MQTT 3.1.1 clients, it's always in default value 0."/>
    /// </summary>
    [JsonProperty("code")]
    public int Code { get; init; }

    /// <summary>
    /// The user properties in the DISCONNECT packet sent by the client. The value is not null only if the client sent a DISCONNECT packet with user properties.
    /// </summary>
    [JsonProperty("userProperties")]
    [JsonConverter(typeof(MqttUserPropertyJsonConverter))]
    public IReadOnlyList<MqttUserProperty>? UserProperties { get; init; }
}