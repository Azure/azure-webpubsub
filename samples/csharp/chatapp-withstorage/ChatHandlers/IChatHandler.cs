// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

namespace Microsoft.Azure.WebPubSub.Samples
{
    public interface IChatHandler
    {
        Task<ChatHistory> LoadHistoryMessageAsync(string user, string pair);

        Task<int> AddMessageAsync(string from, string to, string text);

        Task ReadTo(string from, string to, int sequenceId);
    }
    public record ChatHistory(string user, string pair, int readSequenceId, int pairReadSequenceId, IList<Chat> chats);
    public record Chat(string text, string from, string to, int sequenceId);
}
