
# Socket.IO Chat in Serverless Mode (TS)

This project is an Azure Function-based group chat application that leverages WebPubSub for Socket.IO to enable real-time communication between clients.

## Setup

### Update Connection String

```bash
func settings add WebPubSubForSocketIOConnectionString "<connection string>"
```

# How to run

```bash
func extensions sync
npm install
npm start
```

Visit `http://localhost:7084/api/index` to play with the sample.

## Running Online

Current `azd up` is not work in this sample. 

### Deploying the Infrastructure

```azurecli
func extensions sync
npm install
npm run build
az deployment sub create -n "<deployment-name>" --template-file ./infra/main.bicep --parameters environmentName="<env-name>" location="<location>"
```

### Deploy Functions to Function App

```bash
./deploy.sh "<deployment-name>"
```

