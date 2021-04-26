---
layout: docs
title: WebSocket Clients
group: references
subgroup: server-sdks
toc: true
---

## Using Server SDKs

* [Source Code](https://github.com/johanste/azure-sdk-for-python-pr/tree/webpubsub/sdk/signalr/azure-messaging-webpubsubservice/azure/messaging/webpubsubservice)
* [Package](https://www.myget.org/feed/azure-webpubsub-dev/package/pythonwhl/azure-messaging-webpubsubservice/1.0.0b1)

### Install
```bash
pip install --index-url https://www.myget.org/F/azure-webpubsub-dev/python/ azure-messaging-webpubsubservice
```
### Usage

```python
>>> from azure.messaging.webpubsubservice import WebPubSubServiceClient
>>> from azure.core.credentials import AzureKeyCredential
>>> client = WebPubSubServiceClient(endpoint='{Endpoint}', credential=AzureKeyCredential('{Key}'))
>>> client
<WebPubSubServiceClient> endpoint:'...'
>>> from azure.messaging.webpubsubservice.rest import build_send_to_all_request
>>> request = build_send_to_all_request('{hub}', json={ 'Hello':  'webpubsub!' })
>>> response = client.send_request(request)
>>> response
<RequestsTransportResponse: 202 Accepted>
```
