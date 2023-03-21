# Client with Cert

This sample shows how to allow clients to connect with client cert.

1. Update the webpubsub resource to enable `clientCertEnabled` using *Try It* from https://learn.microsoft.com/rest/api/webpubsub/controlplane/web-pub-sub/create-or-update?tabs=HTTP#webpubsubtlssettings, sample request as below: 

    ```REST
    PUT https://management.azure.com/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/myResourceGroup/providers/Microsoft.SignalRService/webPubSub/myWebPubSubService?api-version=2023-02-01

    {
    "sku": {
        "name": "Standard_S1",
        "tier": "Standard",
        "size": "S1",
        "capacity": 1
    },
    "location": "eastus2",
    "properties": {
        "tls": {
        "clientCertEnabled": true
        }
    }
    }
    ```
2. Create a self-signed certificate `cert.pfx` for the client to use as test purpose

   ```bash
   # generate a private key
   $password = <Replace with your password here>
   openssl genrsa -out private.key 2048
   # generate a self-signed certificate
   openssl req -x509 -new -key private.key -out cert.pem -days 365
   # generate the PKCS12 file
   openssl pkcs12 -export -in cert.pem -inkey private.key -out cert.pfx -passout pass:$password
   ```

3. Go to [server](server/) folder
    1. Run the server using `go run server.go`
    2. Use tunnel tools to expose localhost, for example, ngrok or localtunnel
    3. Go to Web PubSub resource portal and update the event handler settings for `cert` hub
        * Hub: `cert`
        * AllowAnonymous: `true`
        * System event: `connect`
        * Event handler: `<tunnel exposed url>/eventhandler`, e.g. `https://3183.ap.ngrok.io/eventhandler`

4. Go to [client](client/) folder, replace `<your_cert_password>` in [client.go](client/client.go) with the password you used to create the cert file, and replace `<your_endpoint>` with your service endpoint, and start the client with `go run client.go`.

5. You will see the cert thumbprint, the custom query and the custom headers are printed out in your server side.