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
    2. Enable [dev tunnel](https://learn.microsoft.com/aspnet/core/test/dev-tunnels?view=aspnetcore-7.0) to expose local to public

    3. In Visual studio, F5 to run the server side
        
    4. Go to Web PubSub resource portal and update the event handler settings for `cert` hub
        * Hub: `cert`
        * AllowAnonymous: `true`
        * System event: `connect`
        * Event handler: `<dev tunnel url>/eventhandler`, e.g. `https://aaaa.asse.devtunnels.ms/eventhandler`

4. Go to [client](client/) folder, replace `<your_cert_password>` in [Program.cs](client/Program.cs) with the password you used to create the cert file, and replace `<your_endpoint>` with your service endpoint, and start the client with `dotnet run`.

5. You will see the thumbprint printed out in your server side.