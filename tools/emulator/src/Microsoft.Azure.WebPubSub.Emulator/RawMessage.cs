// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Net.WebSockets;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal readonly record struct RawMessage(
    WebSocketMessageType MessageType,
    byte[] Payload);