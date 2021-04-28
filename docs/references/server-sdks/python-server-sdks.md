---
layout: docs
title: WebSocket Clients
group: references
subgroup: server-sdks
toc: true
---

# Azure Web PubSub service client library for Python

Use the client library to:

- Send messages to hubs and groups.
- Send messages to particular users and connections.
- Organize users and connections into groups.
- Close connections
- Grant/revoke/check permissions for an existing connection

[Source code](https://github.com/Azure/azure-sdk-for-python/blob/master/sdk/webpubsub/azure-messaging-webpubsubservice) | [Package (Pypi)][package] | [API reference documentation](https://github.com/Azure/azure-sdk-for-python/blob/master/sdk/webpubsub/azure-messaging-webpubsubservice) | [Product documentation][webpubsubservice_docs]

## Getting started

### Installating the package

```bash
python -m pip install azure-messaging-webpubsubservice
```

#### Prequisites

- Python 2.7, or 3.6 or later is required to use this package.
- You need an [Azure subscription][azure_sub], and a [Azure WebPubSub service instance][webpubsubservice_docs] to use this package.
- An existing Azure Web PubSub service instance.

### Authenticating the client

In order to interact with the Azure WebPubSub service, you'll need to create an instance of the [WebPubSubServiceClient][webpubsubservice_client_class] class. In order to authenticate against the service, you need to pass in an AzureKeyCredential instance with endpoint and api key. The endpoint and api key can be found on the azure portal.

```python
>>> from azure.messaging.webpubsubservice import WebPubSubServiceClient
>>> from azure.core.credentials import AzureKeyCredential
>>> client = WebPubSubServiceClient(endpoint='<endpoint>', credential=AzureKeyCredential('somesecret'))
>>> client
<WebPubSubServiceClient endpoint:'<endpoint>'>
```

## Examples

### Sending a request

```python
>>> from azure.messaging.webpubsubservice import WebPubSubServiceClient
>>> from azure.core.credentials import AzureKeyCredential
>>> from azure.messaging.webpubsubservice.rest import build_send_to_all_request
>>> client = WebPubSubServiceClient(endpoint='<endpoint>', credential=AzureKeyCredential('somesecret'))
>>> request = build_send_to_all_request('default', json={ 'Hello':  'webpubsub!' })
>>> request
<HttpRequest [POST], url: '/api/hubs/default/:send?api-version=2020-10-01'>
>>> response = client.send_request(request)
>>> response
<RequestsTransportResponse: 202 Accepted>
>>> response.status_code 
202
>>> with open('file.json', 'r') as f:
>>>    request = build_send_to_all_request('ahub', content=f, content_type='application/json')
>>>    response = client.send_request(request)
>>> print(response)
<RequestsTransportResponse: 202 Accepted>
```

## Key concepts

### Connection

Connections, represented by a connection id, represent an individual websocket connection to the Web PubSub service. Connection id is always unique.

### Hub

Hub is a logical concept for a set of connections. Connections are always connected to a specific hub. Messages that are broadcast to the hub are dispatched to all connections to that hub. Hub can be used for different applications, different applications can share one Azure Web PubSub service by using different hub names.

### Group

Group allow broadcast messages to a subset of connections to the hub. You can add and remove users and connections as needed. A client can join multiple groups, and a group can contain multiple clients.

### User

Connections to Web PubSub can belong to one user. A user might have multiple connections, for example when a single user is connected across multiple devices or multiple browser tabs.

### Message

Using this library, you can send messages to the client connections. A message can either be string text, JSON or binary payload.

## Troubleshooting

### Logging

This SDK uses Python standard logging library.
You can configure logging print out debugging information to the stdout or anywhere you want.

```python
import logging

logging.basicConfig(level=logging.DEBUG)
```

Http request and response details are printed to stdout with this logging config.

## Next steps

Please take a look at the
[samples][samples_ref]
directory for detailed examples on how to use this library.

<!-- LINKS -->
[webpubsubservice_docs]: https://aka.ms/awps/doc
[azure_cli]: https://docs.microsoft.com/cli/azure
[azure_sub]: https://azure.microsoft.com/free/
[webpubsubservice_client_class]: https://github.com/Azure/azure-sdk-for-python/blob/master/sdk/webpubsub/azure-messaging-webpubsubservice/azure/messaging/webpubsubservice/__init__.py
[package]: https://pypi.org/project/azure-messaging-webpubsubservice/
[default_cred_ref]: https://aka.ms/azsdk-python-identity-default-cred-ref
[samples_ref]: https://github.com/Azure/azure-webpubsub/tree/main/samples/python
