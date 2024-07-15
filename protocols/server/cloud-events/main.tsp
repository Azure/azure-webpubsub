import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi3";
using TypeSpec.Http;

/**
 * This event is triggered when the service receive an MQTT CONNECT packet.
 */
@route("OnMqttClientConnect")
op OnMqttConnect(req: MqttConnectEventRequest & CommonRequestHeaders): {
    @statusCode _: 202;
} | {
    @statusCode _: 200;
    @body res: MqttConnectEventSuccessResponse;
} | {
    /**
     * All the status codes not in range 200-299 are considered as a failure response.
     */
    @statusCode _: 401 | 403 | 500;

    @body res: MqttConnectEventFailureResponse;
};

/**
 * Represents a request for a connection event.
 */
model ConnectEventRequest {
    claims: Record<string[]>;
    query: Record<string[]>;
    headers: Record<string[]>;
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
    protocolVersion: integer;

    /**
     * The username field in the MQTT CONNECT packet.
     */
    username?: string;

    /**
     * The base64 encoded password field in the MQTT CONNECT packet.
     */
    password?: string;

    /**
     * The user properties in the MQTT CONNECT packet.
     */
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

    /**
     * It should be "mqtt" or omitted.
     */
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

/**
 * Represents the response properties of an MQTT connection failure.
 */
model MqttConnectEventFailureResponse {
    mqtt: MqttConnectEventFailureResponseProperties;
}

/**
 * Represents the properties of an MQTT connection failure response.
 */
model MqttConnectEventFailureResponseProperties {
    /**
     * The failure code.
     */
    code: integer;

    /**
     * The reason for the failure.
     */
    reason?: string;

    /**
     * The user properties associated with the failure.
     */
    userProperties?: MqttUserProperty[];
}

model CommonRequestHeaders {
    /**
     * The user the connection authed.
     */
    @header("ce-userId") userId: string;

    /**
     * The hub the connection belongs to.
     */
    @header("ce-hub") hub: string;

    /**
     * The connectionId is unique for the client connection.
     */
    @header("ce-connectionId") connectionId: string;

    /**
     * The name of the event without prefix.
     */
    @header("ce-eventName") eventName: string;

    /**
     * The subprotocol the client is using if any.
     */
    @header("ce-subprotocol") subprotocol: string;

    /**
     * Defines the state for the connection. You can use the same response header to reset the value of the state. Multiple `connectionState` headers aren't allowed. Do base64 encode the string value if it contains complex characters inside, for example, `base64(jsonString)` to pass complex object using this attribute.
     */
    @header("ce-connectionState") connectionState: string;

    /**
     * The signature for the upstream webhook to validate if the incoming request is from the expected origin. The service calculates the value using both primary access key and secondary access key as the `HMAC` key: `Hex_encoded(HMAC_SHA256(accessKey, connectionId))`. The upstream should check if the request is valid before processing it.
     */
    @header("ce-signature") signature: string;
}
