# Configure event handlers

Local development uses hub `sample_<your-demo-name>`, so let's set the event handler through Azure CLI with below command (don't forget to replace `<your-unique-resource-name>` and `<domain-name>` with your own one):

```azurecli
az webpubsub hub create --hub-name sample_<your-demo-name> --name "<your-unique-resource-name>" --resource-group "myResourceGroup" --event-handler url-template=http://<domain-name>.loca.lt/eventhandler/{event} user-event-pattern=* system-event=connect system-event=disconnected system-event=connected
```
