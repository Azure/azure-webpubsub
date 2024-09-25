
# Socket.IO Chat in Serverless Mode (TS)

This project is an Azure Function-based group chat application that leverages WebPubSub for Socket.IO to enable real-time communication between clients.

## Prerequisites

- [Node.js 18](https://nodejs.org/)
- [Azure CLI](https://docs.microsoft.com/cli/azure/install-azure-cli)
- [Azure Functions Core Tools](https://docs.microsoft.com/azure/azure-functions/functions-run-local)

## Setup and running online

The sample uses [Bicep](https://learn.microsoft.com/azure/azure-resource-manager/bicep/overview?tabs=bicep) to deploy the infrastructure. The related Bicep file is located in the `./infra` folder.

### Deploy the infrastructure

```bash
az deployment sub create -n "<deployment-name>" -l "<deployment-location>" --template-file ./infra/main.bicep --parameters environmentName="<env-name>" location="<location>"
```

- `<deployment-name>`: The name of the deployment.
- `<deployment-location>`: The location of the deployment metadata.
- `<env-name>`: The name will be a part of the resource group name and resource name.
- `<location>`: The location of the resources.

After the deployment is completed, you will get the following resources:

- Azure Function App
- Web PubSub for Socket.IO
- Managed Identity

### Deploy the code to the Function App

```bash
# Deploy the project
./deploy/deploy.sh "<deployment-name>"
```

### Run the project

Open the url:

```text
https://<function-endpoint>/api/index
```

:::image type="content" source="chatsample.png" alt-text="Chat sample snapshot":::