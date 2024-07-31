// Code generated by OpenAPI Generator (https://openapi-generator.tech); DO NOT EDIT.

/*
 * (title)
 *
 * No description provided (generated by Openapi Generator https://github.com/openapitools/openapi-generator)
 *
 * API version: 0.0.0
 */

package openapi




// DisconnectEventRequest - Represents a request for a disconnection event.
type DisconnectEventRequest struct {

	Reason string `json:"reason"`
}

// AssertDisconnectEventRequestRequired checks if the required fields are not zero-ed
func AssertDisconnectEventRequestRequired(obj DisconnectEventRequest) error {
	elements := map[string]interface{}{
		"reason": obj.Reason,
	}
	for name, el := range elements {
		if isZero := IsZeroValue(el); isZero {
			return &RequiredError{Field: name}
		}
	}

	return nil
}

// AssertDisconnectEventRequestConstraints checks if the values respects the defined constraints
func AssertDisconnectEventRequestConstraints(obj DisconnectEventRequest) error {
	return nil
}
