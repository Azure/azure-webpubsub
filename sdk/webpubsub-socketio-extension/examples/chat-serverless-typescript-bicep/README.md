
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