---
layout: docs
title: Phase 4 Design Spec
group: specs
toc: true
---

## Azure Web PubSub Service Design Spec [Phase 4]

Phase 4 adds another functionality to the server to enable server-to-server communication:

1. Subscribe to group messages

    Subscribing to group messages requires a persistent connection from server to service, so that whenever a message publish happens, the server can receive the message immediately. That said, when implementing the server protocol, the implementation can choose to only establish the WebSocket connection when the **Subscribe** feature is used.

## Remaining work items
1. Server SDKs to support persistent mode