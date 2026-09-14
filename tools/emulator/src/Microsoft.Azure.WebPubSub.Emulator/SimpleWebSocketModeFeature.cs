// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

namespace Microsoft.Azure.WebPubSub.Emulator;

internal enum SimpleWebSocketMode
{
    SendToGroup,
    SendEvent,
}

internal sealed record SimpleWebSocketModeFeature(SimpleWebSocketMode Mode, string? Group, bool? NoEcho);