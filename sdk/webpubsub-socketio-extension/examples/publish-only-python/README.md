
# Sample: Publish from Azure Function to Socket.IO Serverless (Python)

This project demonstrate how to use Web PubSub for Socket.IO Serverless mode and Azure Function to easily publishing messages to clients.

## Setup

### Update Connection String

```bash
func settings add WebPubSubForSocketIOConnectionString "<connection string>"
```

## Run the sample

```bash
func start
```

Visit the url pointing to `http://<function-uri>/api/index`.

:::image type="content" source="image.png" alt-text="sample":::