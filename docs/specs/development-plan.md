---
layout: docs
title: Development Plan
group: specs
toc: true
---

## Development Plan

### Runtime
#### Public Preview (April 1st)
----
* Phase 1: Support simple WebSocket client, event handlers with HTTP protocol, and server SDK
  * [Phase 1 Design Spec](./phase-1-simple-websocket-client.md)

* Phase 2: Support clients with our subprotocol
  * [Phase 2 Design Spec](./phase-2-subprotocol.md)

-----

#### After Public Preview
----
* Phase 3: Support event handler with protobuf over WebSocket protocol
  * [Phase 3 Design Spec](./phase-3-event-handler-websocket)
* Phase 4: Support Server SDK Subscribe
  * [Phase 4 Design Spec](./phase-4-server-subscribe.md)


### SDK
#### Public Preview (April 1st)
----
* SDK for Server to Service side REST API ready for Tier-1 languages (C#, JS, Java, Python)
* Utility method to generate client auth token provided by the server SDK
* JS SDK for one popular web framework to support handling CloudEvents data from service to server.
* Azure Function related:
  * Azure Function trigger
  * Azure Function output binding

#### After Public Preview
