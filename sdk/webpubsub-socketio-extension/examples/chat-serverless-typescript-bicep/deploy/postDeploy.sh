echo "Loading azd .env file from current environment..."

while IFS='=' read -r key value; do
    value=$(echo "$value" | sed 's/^"//' | sed 's/"$//')
    export "$key=$value"
done <<EOF
$(azd env get-values)
EOF

code=$(az functionapp keys list -g $resourceGroup -n $functionName --query systemKeys.socketio_extension -o tsv)
az webpubsub hub create -n $socketioName -g $resourceGroup --hub-name "hub" --event-handler url-template="https://${functionName}.azurewebsites.net/runtime/webhooks/socketio?code=${code}" user-event-pattern="*" auth-type="ManagedIdentity" auth-resource="$funcAuthClientId"