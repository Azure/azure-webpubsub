set -x
set -e

deploymentName=$1

resourceGroupName=$(az deployment sub show -n $deploymentName --query properties.outputs.resourceGroup.value -o tsv)
sioName=$(az deployment sub show -n $deploymentName --query properties.outputs.socketioName.value -o tsv)
functionName=$(az deployment sub show -n $deploymentName --query properties.outputs.functionName.value -o tsv)
functionAuthClientId=$(az deployment sub show -n $deploymentName --query properties.outputs.funcAuthClientId.value -o tsv)

func azure functionapp publish $functionName

code=$(az functionapp keys list -g $resourceGroupName -n $functionName --query systemKeys.socketio_extension -o tsv)
az webpubsub hub create -n $sioName -g $resourceGroupName --hub-name "hub" --event-handler url-template="https://${functionName}.azurewebsites.net/runtime/webhooks/socketio?code=${code}" user-event-pattern="*" auth-type="ManagedIdentity" auth-resource="$functionAuthClientId"
az webpubsub hub create -n $sioName -g $resourceGroupName --hub-name "hub" --event-handler url-template="https://${functionName}.azurewebsites.net/runtime/webhooks/socketio?code=${code}" user-event-pattern="*" auth-type="ManagedIdentity" auth-resource="$functionAuthClientId"