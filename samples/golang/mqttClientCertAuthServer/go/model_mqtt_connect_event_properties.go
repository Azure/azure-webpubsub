// Code generated by OpenAPI Generator (https://openapi-generator.tech); DO NOT EDIT.

/*
 * (title)
 *
 * No description provided (generated by Openapi Generator https://github.com/openapitools/openapi-generator)
 *
 * API version: 0.0.0
 */

package openapi

// MqttConnectEventProperties - Represents the properties of an MQTT connection.
type MqttConnectEventProperties struct {

	// MQTT protocol version. The same as the CONNECT packet's ProtocolVersion. MQTT 3.1.1 is 4, MQTT 5.0 is 5.
	ProtocolVersion int32 `json:"protocolVersion"`

	// The username field in the MQTT CONNECT packet.
	Username string `json:"username,omitempty"`

	// The base64 encoded password field in the MQTT CONNECT packet.
	Password string `json:"password,omitempty"`

	// The user properties in the MQTT CONNECT packet.
	UserProperties []MqttUserProperty `json:"userProperties,omitempty"`
}

// AssertMqttConnectEventPropertiesRequired checks if the required fields are not zero-ed
func AssertMqttConnectEventPropertiesRequired(obj MqttConnectEventProperties) error {
	elements := map[string]interface{}{
		"protocolVersion": obj.ProtocolVersion,
	}
	for name, el := range elements {
		if isZero := IsZeroValue(el); isZero {
			return &RequiredError{Field: name}
		}
	}

	for _, el := range obj.UserProperties {
		if err := AssertMqttUserPropertyRequired(el); err != nil {
			return err
		}
	}
	return nil
}

// AssertMqttConnectEventPropertiesConstraints checks if the values respects the defined constraints
func AssertMqttConnectEventPropertiesConstraints(obj MqttConnectEventProperties) error {
	for _, el := range obj.UserProperties {
		if err := AssertMqttUserPropertyConstraints(el); err != nil {
			return err
		}
	}
	return nil
}