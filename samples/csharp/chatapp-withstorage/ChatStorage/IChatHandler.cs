// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

namespace Microsoft.Azure.WebPubSub.Samples
{
    public interface IChatHandler
    {
        Task<ChatHistory?> LoadHistoryMessageAsync(string user, string pair, long? beforeSequenceId);

        Task<long> AddMessageAsync(string from, string to, string text);

        Task ReadTo(string from, string to, long sequenceId);

        Task<IList<string>> GetPairsAsync(string name);
    }
}
