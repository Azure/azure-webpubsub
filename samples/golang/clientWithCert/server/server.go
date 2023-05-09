package main

import (
	"log"

	"github.com/gin-gonic/gin"
)

type ClientCertificate struct {
	Thumbprint string `json:"thumbprint"`
}
type ConnectRequest struct {
	Claims             map[string][]string `json:"claims"`
	Query              map[string][]string `json:"query"`
	Headers            map[string][]string `json:"headers"`
	ClientCertificates []ClientCertificate `json:"clientCertificates"`
}

func main() {
	r := gin.Default()
	eventHandlerPath := "/eventhandler"
	r.OPTIONS(eventHandlerPath, func(c *gin.Context) {
		c.Header("WebHook-Allowed-Origin", "*")
		c.Status(200)
	})
	r.POST(eventHandlerPath, func(c *gin.Context) {
		event := c.Request.Header.Get("ce-type")
		if event == "azure.webpubsub.sys.connect" {
			var json ConnectRequest
			if err := c.BindJSON(&json); err != nil {
				log.Println(err.Error())
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}
			// client header
			log.Println(json.Headers["header1"][0])
			// client query
			log.Println(json.Query["query1"][0])
			// client cert thumbprint
			log.Println(json.ClientCertificates[0].Thumbprint)
			c.Status(200)
			return
		}

		c.Status(200)
		return
	})

	r.Run(":8080")
}
