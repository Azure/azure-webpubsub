---
layout: docs
group: references
subgroup: client-websocket-apis
toc: true
---

## WebSocket Clients connecting to the service

Clients connect to the Web PubSub service (in below sections we refer it as the service) using [WebSocket](https://tools.ietf.org/html/rfc6455) protocol. So languages having WebSocket client support can be used to write a client for the service. In below sections we show several WebSocket client samples in different languages.

## Auth
The Web PubSub service uses [JWT token](https://tools.ietf.org/html/rfc7519.html) to validate and auth the clients. Clients can either put the token in the `access_token` query parameter, or put it in `Authorization` header when connecting to the service.

A typical workflow is the client communicates with its app server first to get the URL of the service and the token. And then the client opens the WebSocket connection to the service using the URL and token it receives.

The portal also provides a dynamically generated *Client URL* with token for clients to start a quick test:
![Get URL](./../../images/portal_client_url.png))
> NOTE
> Make sure to include neccessory roles when generating the token.

![Client Role](./../../images/portal_client_roles.png)

To simplify the sample workflow, in below sections, we use this temporarily generated URL from portal for the client to connect, using `<Client_URL_From_Portal>` to represent the value.

### Python

#### Dependency
* [Python 3.6 or above](https://www.python.org/downloads/)
* `pip install websockets`

#### Simple WebSocket Client

```python
import asyncio
import websockets

async def hello():
    uri = '<Client_URL_From_Portal>'
    async with websockets.connect(uri) as ws:
        while True:
            await ws.send('hello')
            greeting = await ws.recv()
            print(greeting)

asyncio.get_event_loop().run_until_complete(hello())
```


#### PubSub WebSocket Client

```python
import asyncio
import websockets

async def join_group():
    uri = '<Client_URL_From_Portal>'
    async with websockets.connect(uri, subprotocols=['json.webpubsub.azure.v1']) as ws:
        await ws.send('{"type":"joinGroup","ackId":1,"group":"group1"}')
        return await ws.recv()

print(asyncio.get_event_loop().run_until_complete(join_group()))
```
