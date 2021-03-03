---
layout: docs
toc: true
title: Server Protocols in Detail
group: specs
---

## Table of Content
- [Event handler](#event_handler)
    - [Upstream Validation](#protection)
    - [Web PubSub Service Atrribute Extension](#extension)
    - [CloudEvents Protocol In Detail](./protocol-cloudevents.md)
- [Connection manager](#connection_manager)
    - [Auth](#auth)
    - [REST Protocol In Detail](./protocol-rest-api.md)
- [Server SDK Design Spec](./server-sdk-design-spec.md)

<a name="event_handler"></a>

## Event Handler

Service delivers client events to the upstream webhook using the [CloudEvents HTTP protocol](https://github.com/cloudevents/spec/blob/v1.0.1/http-protocol-binding.md).

The data sending from the service to the server is always in CloudEvents `binary` format.

<a name="protection"></a>

### Upstream and Validation

Event handlers need to be registered and configured in the service through portal or Azure CLI beforehand so that when a client event is triggered, the service can identify if the event is expected to be handled or not. For public preview, we use `PUSH` mode to invoke the event handler: that the event handler as the server side, exposes public accessible endpoint for the service to invoke when the event is triggered. It acts as a **webhook** **upstream**. 

When configuring the webhook endpoint, the URL can use `{event}` parameter to define an URL template. The service calculates the value of the webhook URL dynamically when the client request comes in. For example, when a request `/client/hubs/chat` comes in, with a configured event handler URL pattern `http://host.com/api/{event}` for hub `chat`, when the client connects, it will first POST to this URL: `http://host.com/api/connect`. This can be extremely useful when a PubSub WebSocket client sends custom events, that the event handler helps dispatch different events to different upstreams. Please NOTE that the `{event}` parameter is not allowed in the URL domain name.

When setting up the event handler upstream through Azure portal or CLI, the service follows the [CloudEvents abuse protection](https://github.com/cloudevents/spec/blob/v1.0/http-webhook.md#4-abuse-protection) to validate the upstream webhook. The `WebHook-Request-Origin` request header is set to the service domain name `xxx.webpubsub.azure.com`, and it expects the response having header `WebHook-Allowed-Origin` to contain this domain name.

When doing the validation, the `{event}` parameter is resolved to `validate`. For example, when trying to set the URL to `http://host.com/api/{event}`, the service tries to **OPTIONS** a request to `http://host.com/api/validate` and only when the response is valid that the configure can be set successfully.

For now , we do not support [WebHook-Request-Rate](https://github.com/cloudevents/spec/blob/v1.0/http-webhook.md#414-webhook-request-rate) and [WebHook-Request-Callback](https://github.com/cloudevents/spec/blob/v1.0/http-webhook.md#413-webhook-request-callback).

### CloudEvents Protocol In Detail

[CloudEvents Protocol In Detail](./protocol-cloudevents.md)

<a name="connection_manager"></a>

## Connection manager

<a name="auth"></a>

### Auth

Service REST API supports 2 types of Auth:
1. JWT Token Auth
2. AAD auth

<TODO: Add details>

### REST Protocol In Detail

[REST Protocol In Detail](./protocol-rest-api.md) 