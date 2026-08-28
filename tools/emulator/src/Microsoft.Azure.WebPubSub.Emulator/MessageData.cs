// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

namespace Microsoft.Azure.WebPubSub.Emulator;

internal enum MessageDataType
{
    Text,
    Binary,
}

internal sealed record MessageData(
    MessageDataType Type,
    ReadOnlyMemory<byte> Bytes);