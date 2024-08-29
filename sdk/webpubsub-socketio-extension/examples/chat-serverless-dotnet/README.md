
# Socket.IO Chat in Serverless Mode (C#)

This project is an Azure Function-based group chat application that leverages WebPubSub for Socket.IO to enable real-time communication between clients.

## Setup

### Update Connection String in `local.settings.json`

```json
{
"WebPubSubForSocketIOConnectionString": "<connection string>"
}
```

## Run the sample

```bash
func start
```

Visit the url pointing to `index` function.
