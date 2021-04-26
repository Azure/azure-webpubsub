# Streaming logs using `json.webpubsub.azure.v1` subprotocol

## Prerequisites

1. [python](https://www.python.org/)
2. Create an Azure Web PubSub resource

## Setup

```bash
# Create venv
python -m venv env

# Active venv
./env/Scripts/activate

# pip install
pip install --index-url https://www.myget.org/F/azure-webpubsub-dev/python azure-messaging-webpubsubservice
pip install -r requirements.txt
```

## Start the server

Copy **Connection String** from **Keys** blade of the created Azure Web PubSub service, and replace the `<connection-string>` below with the value of your **Connection String**.

![Connection String](./../../../docs/images/portal_conn.png)

```bash
python server.py <connection-string>
```

The server is then started. Open `http://localhost:8080` in browser. If you use F12 to view the Network you can see the WebSocket connection is established.

## Start the log streamer
Run:
```bash
# Open a new console and ensure venv active 
./env/Scripts/activate

python stream.py
```

Start typing messages and you can see these messages are transfered to the browser in real-time.
