package openapi

import (
	"context"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"log"
	"net/http"
)

// DefaultAPIService is a service that implements the logic for the DefaultAPIServicer
// This service should implement the business logic for every endpoint for the DefaultAPI API.
// Include any external packages or services that will be required by this service.
type DefaultAPIService struct {
}

// NewDefaultAPIService creates a default api service
func NewDefaultAPIService() *DefaultAPIService {
	return &DefaultAPIService{}
}

// OnMqttClientConnected -
func (s *DefaultAPIService) OnMqttClientConnected(ctx context.Context, cePhysicalConnectionId string, ceHub string, ceConnectionId string, ceEventName string, body map[string]interface{}, ceUserId string, ceSubprotocol string, ceConnectionState string, ceSignature string) (ImplResponse, error) {
	// TODO - update OnMqttClientConnected with the required logic for this service method.
	// Add api_default_service.go to the .openapi-generator-ignore to avoid overwriting this service implementation when updating open api generation.

	// TODO: Uncomment the next line to return response Response(200, {}) or use other options such as http.Ok ...
	// return Response(200, nil),nil

	return Response(http.StatusNotImplemented, nil), errors.New("OnMqttClientConnected method not implemented")
}

// OnMqttClientDisconnected -
func (s *DefaultAPIService) OnMqttClientDisconnected(ctx context.Context, cePhysicalConnectionId string, ceHub string, ceConnectionId string, ceEventName string, mqttDisconnectedEventRequest MqttDisconnectedEventRequest, ceUserId string, ceSubprotocol string, ceConnectionState string, ceSignature string) (ImplResponse, error) {
	// TODO - update OnMqttClientDisconnected with the required logic for this service method.
	// Add api_default_service.go to the .openapi-generator-ignore to avoid overwriting this service implementation when updating open api generation.

	// TODO: Uncomment the next line to return response Response(200, {}) or use other options such as http.Ok ...
	// return Response(200, nil),nil

	return Response(http.StatusNotImplemented, nil), errors.New("OnMqttClientDisconnected method not implemented")
}

// OnMqttConnect -
func (s *DefaultAPIService) OnMqttConnect(ctx context.Context, cePhysicalConnectionId string, ceHub string, ceConnectionId string, ceEventName string, mqttConnectEventRequest MqttConnectEventRequest, ceUserId string, ceSubprotocol string, ceConnectionState string, ceSignature string) (ImplResponse, error) {
	// TODO - update OnMqttConnect with the required logic for this service method.
	// Add api_default_service.go to the .openapi-generator-ignore to avoid overwriting this service implementation when updating open api generation.

	// Similuate the cert verification process
	for _, certObj := range mqttConnectEventRequest.ClientCertificates {
		certPem := []byte(certObj.Content)
		block, _ := pem.Decode(certPem)
		if block == nil {
			continue
		}

		// Parse the certificate
		cert, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			log.Fatalf("Failed to parse the certificate: %v", err)
		}

		// Use the Certificate object
		fmt.Printf("Certificate Subject: %s\n", cert.Subject)
	}

	if mqttConnectEventRequest.Headers["failure"] != nil {
		code := 0
		if mqttConnectEventRequest.Mqtt.ProtocolVersion == 4 {
			code = 5 // Unauthorized Return code in MQTT 3.1.1
		} else {
			code = 135 // Unauthorized Reason code in MQTT 5.0
		}
		return Response(401, MqttConnectEventFailureResponse{
			Mqtt: MqttConnectEventFailureResponseProperties{
				Code:   int32(code),
				Reason: "Unauthorized",
			},
		}), nil
	} else {
		return Response(200, MqttConnectEventSuccessResponse{
			Roles:  []string{"webpubsub.joinLeaveGroup", "webpubsub.sendToGroup"},
			UserId: ceUserId,
		}), nil
	}

	// TODO: Uncomment the next line to return response Response(200, MqttConnectEventSuccessResponse{}) or use other options such as http.Ok ...
	// return Response(200, MqttConnectEventSuccessResponse{}), nil

	// TODO: Uncomment the next line to return response Response(202, {}) or use other options such as http.Ok ...
	// return Response(202, nil),nil

	// TODO: Uncomment the next line to return response Response(401, MqttConnectEventFailureResponse{}) or use other options such as http.Ok ...
	// return Response(401, MqttConnectEventFailureResponse{}), nil

	// TODO: Uncomment the next line to return response Response(403, MqttConnectEventFailureResponse{}) or use other options such as http.Ok ...
	// return Response(403, MqttConnectEventFailureResponse{}), nil

	// TODO: Uncomment the next line to return response Response(500, MqttConnectEventFailureResponse{}) or use other options such as http.Ok ...
	// return Response(500, MqttConnectEventFailureResponse{}), nil

}
