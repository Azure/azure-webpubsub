# IoT Hub data visualization using Azure WebPubSub and Function 

## Intro

This is a simple app showing how to show IoT device temperature and humidity in real-time using Azure Web PubSub. Function works as the serverless compute to get device data from IoT hub and uses Azure Web PubSub to broadcast data to the website.

## Prerequisites
1. [Node.js(v18.0 or above)](https://nodejs.org/)
2. [Azure Function Core Tools(v4)](https://www.npmjs.com/package/azure-functions-core-tools)
3. [Azure Storage Emulator](https://go.microsoft.com/fwlink/?linkid=717179&clcid=0x409) or valid Azure Storage connection string.
4. [Create an IoT Hub ](https://docs.microsoft.com/azure/iot-hub/quickstart-send-telemetry-cli)
5. [Create a Web PubSub](https://docs.microsoft.com/azure/azure-web-pubsub/quickstart-cli-create)

## Update the settings
1. Replace the `<your-hub-name>` in `local.settings.json` with your IoT Hub name (`{YourIoTHubName}` used when creating your IoT Hub).

2. Get the **Service Connection String** for IoT Hub using below CLI command, and replace the `<iot-connection-string>` in `local.settings.json` with the value.

```azcli
az iot hub connection-string show --policy-name service --hub-name {YourIoTHubName} --output table --default-eventhub
```

3. Get the **Connection String** for Web PubSub using below CLI command, and replace the `<webpubsub-connection-string>` in `local.settings.json` with the value.

```azcli
az webpubsub key show --name "<your-unique-resource-name>" --resource-group "<your-resource-group>" --query primaryConnectionString
```

## Start the function locally

1. Install function extensions

```bash
func extensions install
```

2. Start app

```bash
func start
```

## Send device data

- For quickest results, simulate temperature data using the [Raspberry Pi Azure IoT Online Simulator](https://azure-samples.github.io/raspberry-pi-web-simulator/#Getstarted). Paste in the **device connection string**, and select the **Run** button.

    Use the below command to get the **device connection string**:
    ```azcli
    az iot hub device-identity connection-string show --device-id {yourDeviceId} --hub-name {YourIoTHubName}
    ```

- If you have a physical Raspberry Pi and BME280 sensor, you may measure and report real temperature and humidity values by following the [Connect Raspberry Pi to Azure IoT Hub (Node.js)](https://docs.microsoft.com/en-us/azure/iot-hub/iot-hub-raspberry-pi-kit-node-get-started) tutorial.

## Run the visualization website
Open function host index page: `http://localhost:7071/api/index` to view the real-time dashboard.

