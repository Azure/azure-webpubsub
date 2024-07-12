/**
 * Represents a request for a connection event.
 */
model ConnectEventRequest {
    claims: Record<string, string[]>;
    query: Record<string, string[]>;
    headers: Record<string, string[]>;
    subprotocols: string[];
    clientCertificates: ClientCertificateInfo[];
}

model ClientCertificateInfo {
    thumbprint: string;
    content: string;
}

/**
 * Represents a request for an MQTT connection event.
 */
model MqttConnectEventRequest extends ConnectEventRequest {
    mqtt: MqttProperties;
}

/**
 * Represents the properties of an MQTT connection.
 */
model MqttProperties {
    /**
     * MQTT protocol version. The same as the CONNECT packet's ProtocolVersion. 
     * MQTT 3.1.1 is 4, MQTT 5.0 is 5.
     */
    protocolVersion: int;

    /**
     * The username field in the MQTT CONNECT packet.
     */
    username?: string;

    /**
     * The password field in the MQTT CONNECT packet.
     * Use string type instead of byte[] to avoid the problem of serialization.
     * Although System.Text.Json serializes byte[] to base64 string by default, it is not explicitly documented.
     */
    password?: string;

    userProperties?: MqttUserProperty[];
}

/**
 * Represents a user property in an MQTT connection.
 */
model MqttUserProperty {
    name: string;
    value: string;
}

/**
 * Represents a successful response to an MQTT connection event.
 */
model MqttConnectEventSuccessResponse {
    roles?: string[];
    subprotocol?: string;
    userId?: string;
    groups?: string[];
    mqtt?: MqttConnectEventSuccessResponseProperties;
}

/**
 * Represents the MQTT specific properties in a successful MQTT connection event response.
 */
model MqttConnectEventSuccessResponseProperties {
    userProperties?: MqttUserProperty[];
}
