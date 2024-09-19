// Code generated by OpenAPI Generator (https://openapi-generator.tech); DO NOT EDIT.

/*
 * (title)
 *
 * No description provided (generated by Openapi Generator https://github.com/openapitools/openapi-generator)
 *
 * API version: 0.0.0
 */

package openapi




// MqttConnectEventFailureResponseProperties - Represents the properties of an MQTT connection failure response.
type MqttConnectEventFailureResponseProperties struct {

	// The failure code. It will be sent to the clients in the CONNACK packet as a return code (MQTT 3.1.1) or reason code (MQTT 5.0). Upstream webhook should select a valid integer value defined the MQTT protocols according to the protocol versions of the clients. If Upstream webhook sets an invalid value, clients will receive \"unspecified error\" in the CONNACK packet.
	Code int32 `json:"code"`

	// The reason for the failure. It's a human readable failure reason string designed for diagnostics. It will be sent to those clients whose protocols support reason string in the CONNACK packet. Now only MQTT 5.0 supports it.
	Reason string `json:"reason,omitempty"`

	// The user properties associated with the failure. They'll be converted to user properties in the CONNACK packet, and sent to clients whose protocols support user properties. Now only MQTT 5.0 supports user properties. Upstream webhook can use the property for additional diagnostic or other information.
	UserProperties []MqttUserProperty `json:"userProperties,omitempty"`
}

// AssertMqttConnectEventFailureResponsePropertiesRequired checks if the required fields are not zero-ed
func AssertMqttConnectEventFailureResponsePropertiesRequired(obj MqttConnectEventFailureResponseProperties) error {
	elements := map[string]interface{}{
		"code": obj.Code,
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

// AssertMqttConnectEventFailureResponsePropertiesConstraints checks if the values respects the defined constraints
func AssertMqttConnectEventFailureResponsePropertiesConstraints(obj MqttConnectEventFailureResponseProperties) error {
	for _, el := range obj.UserProperties {
		if err := AssertMqttUserPropertyConstraints(el); err != nil {
			return err
		}
	}
	return nil
}