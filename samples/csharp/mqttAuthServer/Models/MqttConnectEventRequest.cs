using Newtonsoft.Json;

namespace Microsoft.Azure.WebPubSub.CloudEvents;

#nullable enable

public class MqttConnectEventRequest : ConnectEventRequest
{

    [JsonProperty("mqtt")]
    public MqttProperties Mqtt { get; set; }
}

public class MqttProperties
{
    /// <summary>
    /// MQTT protocol version. The same as the CONNECT packet's ProtocolVersion. MQTT 3.1.1 is 4, MQTT 5.0 is 5.
    /// </summary>
    [JsonProperty("protocolVersion")]
    public int ProtocolVersion { get; set; }

    public MqttProperties(int protocolVersion)
    {
        ProtocolVersion = (int)protocolVersion;
    }

    /// <summary>
    /// The username field in the MQTT CONNECT packet.
    /// </summary>
    [JsonProperty("username")]
    public string? Username { get; set; }

    /// <summary>
    ///The password field in the MQTT CONNECT packet.
    /// Use string type instead of byte[] to avoid the problem of serialization.
    /// Although System.Text.Json serializes byte[] to base64 string by default, it is not explicitly documented.
    /// </summary>
    [JsonProperty("password")]
    public string? Password { get; set; }

    [JsonProperty("userProperties")]
    public IReadOnlyList<MqttUserProperty>? UserProperties { get; init; }
}
