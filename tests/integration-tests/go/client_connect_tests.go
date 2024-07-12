package integration_tests

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/arm"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/to"
	"github.com/Azure/azure-sdk-for-go/sdk/internal/recording"
	"github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/internal/v3/testutil"
	"github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resources/armresources"
	"github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/webpubsub/armwebpubsub"
	"github.com/stretchr/testify/suite"
	"golang.org/x/net/websocket"
)

type ClientConnectTestsSuite struct {
	suite.Suite
	serviceClient *armwebpubsub.Client
}

func (suite *ClientConnectTestsSuite) SetupSuite() {
	// Setup code here
	connectionString := recording.GetEnvVariable("WEB_PUBSUB_CONNECTION_STRING", "")
	if connectionString == "" {
		suite.T().Fatal("Please set the WEB_PUBSUB_CONNECTION_STRING environment variable.")
	}
	client, err := armwebpubsub.NewClient(connectionString, nil)
	if err != nil {
		suite.T().Fatal(err)
	}
	suite.serviceClient = client
}

func (suite *ClientConnectTestsSuite) TearDownSuite() {
	// Teardown code here
}

func (suite *ClientConnectTestsSuite) TestSimpleWebSocketClientCanConnectAndReceiveMessages() {
	options := &armwebpubsub.ClientOptions{}
	url, err := suite.serviceClient.GetClientAccessUri(context.Background(), options)
	if err != nil {
		suite.T().Fatal(err)
	}

	client, err := NewWebSocketClient(url, IsSimpleClientEndSignal)
	if err != nil {
		suite.T().Fatal(err)
	}

	defer client.Stop()

	textContent := "Hello"
	suite.serviceClient.SendToAll(context.Background(), textContent, armwebpubsub.ContentTypeTextPlain)

	jsonContent := map[string]string{"hello": "world"}
	jsonData, _ := json.Marshal(jsonContent)
	suite.serviceClient.SendToAll(context.Background(), jsonData, armwebpubsub.ContentTypeApplicationJSON)

	binaryContent := []byte("Hello")
	suite.serviceClient.SendToAll(context.Background(), binaryContent, armwebpubsub.ContentTypeApplicationOctetStream)

	suite.serviceClient.SendToAll(context.Background(), GetEndSignalBytes(), armwebpubsub.ContentTypeApplicationOctetStream)

	client.WaitForConnected()
	client.LifetimeTask()

	frames := client.ReceivedFrames
	suite.Equal(3, len(frames))
	suite.Equal(textContent, frames[0].MessageAsString)
	suite.Equal(string(jsonData), frames[1].MessageAsString)
	suite.Equal(binaryContent, frames[2].MessageBytes)
}

func (suite *ClientConnectTestsSuite) TestWebSocketClientWithInitialGroupCanConnectAndReceiveGroupMessages() {
	options := &armwebpubsub.ClientOptions{}
	group := "GroupA"
	url, err := suite.serviceClient.GetClientAccessUri(context.Background(), options, armwebpubsub.GetClientAccessUriOptions{Groups: []string{group}})
	if err != nil {
		suite.T().Fatal(err)
	}

	client, err := NewWebSocketClient(url, IsSimpleClientEndSignal)
	if err != nil {
		suite.T().Fatal(err)
	}

	defer client.Stop()

	textContent := "Hello"
	suite.serviceClient.SendToGroup(context.Background(), group, textContent, armwebpubsub.ContentTypeTextPlain)

	jsonContent := map[string]string{"hello": "world"}
	jsonData, _ := json.Marshal(jsonContent)
	suite.serviceClient.SendToGroup(context.Background(), group, jsonData, armwebpubsub.ContentTypeApplicationJSON)

	binaryContent := []byte("Hello")
	suite.serviceClient.SendToGroup(context.Background(), group, binaryContent, armwebpubsub.ContentTypeApplicationOctetStream)

	suite.serviceClient.SendToGroup(context.Background(), group, GetEndSignalBytes(), armwebpubsub.ContentTypeApplicationOctetStream)

	client.WaitForConnected()
	client.LifetimeTask()

	frames := client.ReceivedFrames
	suite.Equal(3, len(frames))
	suite.Equal(textContent, frames[0].MessageAsString)
	suite.Equal(string(jsonData), frames[1].MessageAsString)
	suite.Equal(binaryContent, frames[2].MessageBytes)
}

func (suite *ClientConnectTestsSuite) TestSubprotocolWebSocketClientCanConnectAndReceiveMessages() {
	options := &armwebpubsub.ClientOptions{}
	url, err := suite.serviceClient.GetClientAccessUri(context.Background(), options)
	if err != nil {
		suite.T().Fatal(err)
	}

	client, err := NewWebSocketClient(url, IsSubprotocolClientEndSignal, func(ws *websocket.Config) {
		ws.Protocol = []string{"json.webpubsub.azure.v1"}
	})
	if err != nil {
		suite.T().Fatal(err)
	}

	defer client.Stop()

	textContent := "Hello"
	suite.serviceClient.SendToAll(context.Background(), textContent, armwebpubsub.ContentTypeTextPlain)

	jsonContent := map[string]string{"hello": "world"}
	jsonData, _ := json.Marshal(jsonContent)
	suite.serviceClient.SendToAll(context.Background(), jsonData, armwebpubsub.ContentTypeApplicationJSON)

	binaryContent := []byte("Hello")
	suite.serviceClient.SendToAll(context.Background(), binaryContent, armwebpubsub.ContentTypeApplicationOctetStream)

	suite.serviceClient.SendToAll(context.Background(), GetEndSignalBytes(), armwebpubsub.ContentTypeApplicationOctetStream)

	client.WaitForConnected()
	client.LifetimeTask()

	frames := client.ReceivedFrames
	suite.Equal(4, len(frames))

	var connected ConnectedMessage
	json.Unmarshal([]byte(frames[0].MessageAsString), &connected)
	suite.NotNil(connected)
	suite.Equal("connected", connected.Event)

	suite.Equal(string(jsonData), frames[1].MessageAsString)
	suite.Equal(string(jsonData), frames[2].MessageAsString)
	suite.Equal(binaryContent, frames[3].MessageBytes)
}

func IsSimpleClientEndSignal(frame WebSocketFrame) bool {
	bytes := frame.MessageBytes
	return len(bytes) == 3 && bytes[0] == 5 && bytes[1] == 1 && bytes[2] == 1
}

func IsSubprotocolClientEndSignal(frame WebSocketFrame) bool {
	return frame.MessageAsString == `{"type":"message","from":"server","dataType":"binary","data":"BQEB"}`
}

func GetEndSignalBytes() []byte {
	return []byte{5, 1, 1}
}

type ConnectedMessage struct {
	Type         string `json:"type"`
	Event        string `json:"event"`
	UserId       string `json:"userId"`
	ConnectionId string `json:"connectionId"`
}

type WebSocketFrame struct {
	MessageAsString string
	MessageBytes    []byte
	MessageType     int
}

type WebSocketClient struct {
	ws             *websocket.Conn
	uri            string
	isEndSignal    func(WebSocketFrame) bool
	ReceivedFrames []WebSocketFrame
}

func NewWebSocketClient(uri string, isEndSignal func(WebSocketFrame) bool, configureOptions ...func(*websocket.Config)) (*WebSocketClient, error) {
	config, err := websocket.NewConfig(uri, uri)
	if err != nil {
		return nil, err
	}
	for _, option := range configureOptions {
		option(config)
	}
	ws, err := websocket.DialConfig(config)
	if err != nil {
		return nil, err
	}
	client := &WebSocketClient{
		ws:          ws,
		uri:         uri,
		isEndSignal: isEndSignal,
	}
	go client.receiveLoop()
	return client, nil
}

func (client *WebSocketClient) Stop() {
	client.ws.Close()
}

func (client *WebSocketClient) WaitForConnected() {
	// Implement wait for connected logic if needed
}

func (client *WebSocketClient) LifetimeTask() {
	// Implement lifetime task logic if needed
}

func (client *WebSocketClient) receiveLoop() {
	for {
		var msg = make([]byte, 512)
		n, err := client.ws.Read(msg)
		if err != nil {
			return
		}
		frame := WebSocketFrame{
			MessageBytes:    msg[:n],
			MessageAsString: string(msg[:n]),
		}
		if client.isEndSignal(frame) {
			return
		}
		client.ReceivedFrames = append(client.ReceivedFrames, frame)
	}
}

func TestClientConnectTestsSuite(t *testing.T) {
	suite.Run(t, new(ClientConnectTestsSuite))
}
