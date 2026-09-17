// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

namespace Microsoft.Azure.WebPubSub.Emulator;

internal static class Constants
{
    public static class Message
    {
        public const int MaxTtlSeconds = 300;
    }

    public static class Metadata
    {
        public const int MaxTotalBytes = 8 * 1024;
        public const int MaxKeyBytes = 256;
        public const int MaxValueBytes = 1024;
    }

    public static class Permission
    {
        public const int MaxLiteralCount = 1000;
        public const int MaxPatternComplexity = 5; // Maximum complexity for patterns, e.g., number of '*' characters
        public const int MaxPatternCount = 10;
        public const int MaxPatternLength = 1024;
    }
}