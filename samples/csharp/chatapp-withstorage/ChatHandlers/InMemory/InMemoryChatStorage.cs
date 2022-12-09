// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Collections.Concurrent;

using Newtonsoft.Json;

namespace Microsoft.Azure.WebPubSub.Samples
{
    public class InMemoryChatStorage : IChatHandler
    {
        private readonly ConcurrentDictionary<string, SessionMessage> _chatStorage = new();
        public Task<int> AddMessageAsync(string from, string to, string text)
        {
            var key = GetKey(from, to);
            var session = _chatStorage.GetOrAdd(key, k => new SessionMessage(from, to));
            return Task.FromResult(session.AddMessage(from, to, text));
        }

        public Task<ChatHistory> LoadHistoryMessageAsync(string user, string pair)
        {
            var key = GetKey(user, pair);
            if (_chatStorage.TryGetValue(key, out SessionMessage session))
            {
                return Task.FromResult(new ChatHistory(user, pair, session.ReadTo[pair], session.ReadTo[user], session.Chats.Values));
            }
            else
            {
                return Task.FromResult<ChatHistory>(default);
            }
        }

        /// <summary>
        /// User read pair's message to "sequenceId"
        /// </summary>
        /// <param name="user"></param>
        /// <param name="pair"></param>
        /// <param name="sequenceId"></param>
        /// <returns></returns>
        public Task ReadTo(string user, string pair, int sequenceId)
        {
            var key = GetKey(user, pair);
            var session = _chatStorage.GetOrAdd(key, k => new SessionMessage(user, pair));
            session.ReadTo[pair] = sequenceId;
            return Task.CompletedTask;
        }

        private string GetKey(string from, string to)
        {
            return JsonConvert.SerializeObject(new string[] { from, to }.OrderBy(s => s));
        }

        private sealed class SessionMessage
        {
            private object _lock = new object();
            private int _lastSequenceId = 0;
            public int LastSequenceId => _lastSequenceId;

            public ConcurrentDictionary<string, int> ReadTo { get; } = new();

            public SortedList<int, Chat> Chats { get; } = new();
            public SessionMessage(string pair1, string pair2)
            {
                ReadTo[pair1] = 0;
                ReadTo[pair2] = 0;
            }
            public int AddMessage(string from, string to, string text)
            {
                var sequenceId = Interlocked.Increment(ref _lastSequenceId);
                lock (_lock)
                {
                    Chats.TryAdd(sequenceId, new Chat(text, from, to, sequenceId));
                }
                return sequenceId;
            }
        }
    }
}
