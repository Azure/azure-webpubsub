# Notifications

## Intro

This is a simple app to simulate the scenario of monitoring lab temperature and humidity. Function works as the serverless compute to get and broadcast messages. When clients are connected to service, they'll receive real-time notifications.

## Prerequisites
1. [Azure Function Core Tools(v3)](https://www.npmjs.com/package/azure-functions-core-tools)
2. [Azure Storage Emulator](https://go.microsoft.com/fwlink/?linkid=717179&clcid=0x409) or valid Azure Storage connection string.

## Setup and Run

1. Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, and replace the `<connection-string>` below with the value of your **Connection String** in `local.settings.json`.

![Connection String](./../../../../docs/images/portal_conn.png)

2. Start app

```bash
func start
```

3. Open function host index page: `http://localhost:7071/api/index` to view the notifations broadcast from function.