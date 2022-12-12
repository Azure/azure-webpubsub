// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

namespace Microsoft.Azure.WebPubSub.Samples
{
    public record ChatHistory(string user, string pair, long readSequenceId, long pairReadSequenceId, IList<Chat> chats);
}
