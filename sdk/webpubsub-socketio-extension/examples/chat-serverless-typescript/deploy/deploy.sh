set -e

BASEDIR=$(dirname $0)
pushd $BASEDIR/..

func extensions sync
npm install
npm run build

deploymentName=$1

resourceGroupName=$(az deployment sub show -n $deploymentName --query properties.outputs.resourceGroup.value -o tsv)
sioName=$(az deployment sub show -n $deploymentName --query properties.outputs.socketioName.value -o tsv)
functionName=$(az deployment sub show -n $deploymentName --query properties.outputs.functionName.value -o tsv)
functionAuthClientId=$(az deployment sub show -n $deploymentName --query properties.outputs.funcAuthClientId.value -o tsv)

echo "Deploying functions to $functionName"
func azure functionapp publish $functionName

echo "Configuring Web PubSub for Socket.IO hub settings for $sioName"
code=$(az functionapp keys list -g $resourceGroupName -n $functionName --query systemKeys.socketio_extension -o tsv)
az webpubsub hub create -n $sioName -g $resourceGroupName --hub-name "hub" --event-handler url-template="https://${functionName}.azurewebsites.net/runtime/webhooks/socketio?code=${code}" system-event="connect" system-event="connected" system-event="disconnected" user-event-pattern="*" auth-type="ManagedIdentity" auth-resource="$functionAuthClientId"

echo "Finished"
popd