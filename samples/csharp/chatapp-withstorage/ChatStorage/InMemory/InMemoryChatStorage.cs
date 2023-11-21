// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Collections.Concurrent;
using System.Reflection.Metadata.Ecma335;
using System.Text.Json;

namespace Microsoft.Azure.WebPubSub.Samples
{
    public class InMemoryChatStorage : IChatHandler
    {
        private readonly ConcurrentDictionary<string, SessionMessage> _chatStorage = new();

        private readonly ConcurrentDictionary<string, List<string>> _fromAsKey = new ();
        private readonly ConcurrentDictionary<string, List<string>> _toAsKey = new ();

        public Task<long> AddMessageAsync(string from, string to, string text)
        {
            var key = GetKey(from, to);
            var session = _chatStorage.GetOrAdd(key, k => new SessionMessage(from, to));
            _fromAsKey.AddOrUpdate(from, s => new List<string> { to }, (k, v) =>
            {
                lock (v)
                {
                    v.Add(to);
                }
                return v;
            });
            _toAsKey.AddOrUpdate(to, s => new List<string> { from }, (k, v) =>
            {
                lock (v)
                {
                    v.Add(from);
                }
                return v;
            });
            return Task.FromResult(session.AddMessage(from, to, text));
        }

        public Task<ChatHistory?> LoadHistoryMessageAsync(string user, string pair, long? beforeSequenceId)
        {
            var key = GetKey(user, pair);
            if (_chatStorage.TryGetValue(key, out SessionMessage? session) && session != null)
            {
                var chats = session.GetChats(beforeSequenceId);
                return Task.FromResult<ChatHistory?>(new ChatHistory(user, pair, session.ReadTo[pair], session.ReadTo[user], chats));
            }
            else
            {
                return Task.FromResult<ChatHistory?>(default);
            }
        }

        public Task<IList<string>> GetPairsAsync(string name)
        {
            List<string> pairs = new List<string>();
            if (_fromAsKey.TryGetValue(name, out var to))
            {
                pairs.AddRange(to);
            }
            if (_toAsKey.TryGetValue(name, out var from))
            {
                pairs.AddRange(from);
            }
            return Task.FromResult((IList<string>)pairs);
        }

        /// <summary>
        /// User read pair's message to "sequenceId"
        /// </summary>
        /// <param name="user"></param>
        /// <param name="pair"></param>
        /// <param name="sequenceId"></param>
        /// <returns></returns>
        public Task ReadTo(string user, string pair, long sequenceId)
        {
            var key = GetKey(user, pair);
            var session = _chatStorage.GetOrAdd(key, k => new SessionMessage(user, pair));

            session.ReadTo.AddOrUpdate(pair, sequenceId, (s, l) => sequenceId > l ? sequenceId : l);
            return Task.CompletedTask;
        }

        private string GetKey(string from, string to)
        {
            return JsonSerializer.Serialize(new string[] { from, to }.OrderBy(s => s));
        }

        private sealed class SessionMessage
        {
            private object _lock = new object();
            private long _lastSequenceId = 0;
            public long LastSequenceId => _lastSequenceId;

            public ConcurrentDictionary<string, long> ReadTo { get; } = new();

            private readonly SortedList<long, Chat> _chats = new();

            public SessionMessage(string pair1, string pair2)
            {
                ReadTo[pair1] = 0;
                ReadTo[pair2] = 0;
            }

            public IList<Chat> GetChats(long? beforeSequenceId)
            {
                if (beforeSequenceId == null)
                {
                    return _chats.Values;
                }

                return _chats.Values.Where(s => s.sequenceId < beforeSequenceId).ToList();
            }

            public long AddMessage(string from, string to, string text)
            {
                var sequenceId = Interlocked.Increment(ref _lastSequenceId);
                lock (_lock)
                {
                    _chats.TryAdd(sequenceId, new Chat(text, from, to, sequenceId));
                }
                return sequenceId;
            }
        }
    }
}
