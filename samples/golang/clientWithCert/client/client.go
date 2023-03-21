package main

import (
	"crypto/tls"
	"fmt"
	"io/ioutil"
	"net/http"

	"github.com/gorilla/websocket"
	"golang.org/x/crypto/pkcs12"
)

func main() {
	certPassword := "<your_cert_password>"
	endpoint := "<your_endpoint>"

	fileName := "cert.pfx"
	// Load the PFX file
	pfxData, err := ioutil.ReadFile(fileName)
	if err != nil {
		fmt.Println("Error reading PFX file:", err)
		return
	}
	privateKey, certificate, err := pkcs12.Decode(pfxData, certPassword)
	// Extract the certificate and private key from the PFX file
	if err != nil {
		fmt.Println("Error loading X509 key pair:", err)
		return
	}

	// Create a TLS configuration with the certificate
	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{{
			Certificate: [][]byte{certificate.Raw},
			PrivateKey:  privateKey,
		}},
	}

	headers := http.Header{}
	headers.Set("header1", "value1")

	// Set up the WebSocket connection with the HTTP client
	dialer := &websocket.Dialer{
		Proxy:           http.ProxyFromEnvironment,
		TLSClientConfig: tlsConfig,
	}

	conn, _, err := dialer.Dial(fmt.Sprintf("wss://%s.webpubsub.azure.com/client/hubs/cert?query1=value1", endpoint), headers)
	if err != nil {
		panic(err)
	}
	fmt.Println("Connected")

	fmt.Scanln()
	conn.Close()
}
