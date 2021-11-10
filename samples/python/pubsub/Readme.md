# Publish and subscribe messages

## Prerequisites

1. [python](https://www.python.org/)
2. Create an Azure Web PubSub resource

## Setup

```bash
# Create venv
python -m venv env

# Active venv
source ./env/bin/activate

# pip install
pip install -r requirements.txt
```

## Start subscriber

Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, and replace the `<connection-string>` below with the value of your **Connection String**.

![Connection String](./../../../docs/images/portal_conn.png)

```bash
python subscribe.py "<connection-string>" pubsub
```

The subscriber is then connected.

## Start publisher

Replace the `<connection-string>` below with the value of your **Connection String**:

```bash
# 1. Start a new terminal. Navigate to the folder
# 2. Active venv
source ./env/bin/activate
# 3. Replace the <connection-string> below with the value of your Connection String:
python publish.py "<connection-string>" pubsub Hello,world
```

You can see that the client receives message `Hello,world`.
