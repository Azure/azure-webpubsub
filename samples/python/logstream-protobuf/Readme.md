# Streaming logs using `protobuf.webpubsub.azure.v1`subprotocol

## Prerequisites

1. [python](https://www.python.org/)
1. [Protobuf](https://github.com/protocolbuffers/protobuf/releases/)
1. Create an Azure Web PubSub resource

## Setup

```bash
# Create venv
python -m venv env

# Active venv
./env/Scripts/activate

# pip install
pip install -r requirements.txt

# Generate protobuf
protoc --python_out=./ --mypy_out=./ ./pubsub.proto
```
on Mac/Linux use `source ./env/bin/activate` to activate venv.
## Start the server

Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, and replace the `<connection-string>` below with the value of your **Connection String**.

![Connection String](./../../../docs/images/portal_conn.png)

```bash
python server.py "<connection-string>"
```

The server is then started. Open `http://localhost:8080` in browser. If you use F12 to view the Network you can see the WebSocket connection is established.

## Start the log streamer
Run:
```bash
# Open a new console and ensure venv active 
./env/Scripts/activate

python stream.py
```
on Mac/Linux use `source ./env/bin/activate` to activate venv.

Start typing messages and you can see these messages are transfered to the browser in real-time.
