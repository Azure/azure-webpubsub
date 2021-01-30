---
layout: docs
title: Phase 1 Design Spec
group: specs
toc: true
---

## Azure Web PubSub Service Design Spec [Phase 3]

Phase 3 adds another functionality to the server to enable server-to-server communication:

1. Subscribe to group messages

    Subscribing to group messages requires a persistent connection from server to service, so that whenever a message publish happens, the server can receive the message immediately. That said, when implementing the server protocol, the implementation can choose to only establish the WebSocket connection when the **Subscribe** feature is used.

## Remaining work items
1. Server SDKs to support persistent mode