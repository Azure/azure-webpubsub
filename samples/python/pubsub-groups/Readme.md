# Publish and subscribe messages via groups

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

Now start 2 or more Terminal windows and activate your
prepared virtual environment:
```bash
# 1. Start a new terminal. Navigate to the folder
# 2. Active venv
source ./env/bin/activate
```

In each Terminal run the following Python program
each with the same hub_name, group_name but a different user_name:
```bash
python run.py "<connection-string>" "<hub_name>" "<user_name>" "<group_name>"
```
You should see a prompt like this
```
WebSocket connected
Listening for messages from WebSocket...
Enter a message to send or 'x' to terminate:
```

Enter messages in each window and you will see them being sent to
all the other windows.  So you have a full bidirectional communication
channel between your named "group".

The group messages have the following JSON structure:

```
{'type': 'message', 'from': 'group', 'fromUserId': 'chris', 'group': 'fun', 'dataType': 'json', 'data': 'ok I think this is super cool!'}
```

The message you enter from the prompt becomes the `data` field.
But the group message also contains information about which group
it is, and who the sender was (`fromUserId`) which can be very handy.
