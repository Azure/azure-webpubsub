package integration_tests

import (
	"context"
	"fmt"
	"os"
	"testing"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/arm"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/to"
	"github.com/Azure/azure-sdk-for-go/sdk/internal/recording"
	"github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/internal/v3/testutil"
	"github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/resources/armresources"
	"github.com/Azure/azure-sdk-for-go/sdk/resourcemanager/webpubsub/armwebpubsub"
	"github.com/stretchr/testify/suite"
)

type TestEnvironment struct {
	suite.Suite
	ConnectionString string
}

func (te *TestEnvironment) SetupSuite() {
	// TODO: provision the resources?
	// What if multiple different resources needed?
	if err := recording.LoadEnv(); err != nil {
		te.T().Fatal(err)
	}

	te.ConnectionString = os.Getenv("WEB_PUBSUB_CONNECTION_STRING")
	if te.ConnectionString == "" {
		te.T().Fatal("Please set the WEB_PUBSUB_CONNECTION_STRING environment variable.")
	}
}

func (te *TestEnvironment) TearDownSuite() {
	// Clean up any resources if necessary
}

func TestMain(m *testing.M) {
	suite.Run(&testing.T{}, new(TestEnvironment))
}
