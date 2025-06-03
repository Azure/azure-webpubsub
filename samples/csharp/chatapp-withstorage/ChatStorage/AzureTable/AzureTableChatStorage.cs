// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Text.Json;

using Azure;
using Azure.Data.Tables;

namespace Microsoft.Azure.WebPubSub.Samples
{
    public class AzureTableChatStorage : IChatHandler
    {
        private static string[] SequenceIdColumn = new string[] { nameof(SessionEntity.ReadToSequenceId) };

        private readonly TableClient _tableClient;

        public AzureTableChatStorage(IConfiguration config)
        {
            var tableName = "chat";
            _tableClient = new TableClient(config["Azure:Storage:ConnectionString"], tableName);
            _tableClient.CreateIfNotExists();
        }

        public async Task<IList<string>> GetPairsAsync(string name)
        {
            var query = _tableClient.QueryAsync<SessionEntity>(
                e => e.PartitionKey == name || e.RowKey == name);

            var pairs = new List<string>();
            await foreach (var entity in query)
            {
                var p = entity.PartitionKey;
                var r = entity.RowKey;
                pairs.Add(p == name? r : p);
            }

            return pairs;
        }

        public async Task<ChatHistory?> LoadHistoryMessageAsync(string user, string pair, long? beforeSequenceId)
        {
            var key = GetChatKey(user, pair);
            IAsyncEnumerable<ChatEntity> query;
            if (beforeSequenceId.HasValue)
            {
                query = _tableClient.QueryAsync<ChatEntity>(e => e.PartitionKey == key && e.SequenceId < beforeSequenceId);
            }
            else
            {
                query = _tableClient.QueryAsync<ChatEntity>(e => e.PartitionKey == key);
            }

            var messages = new List<Chat>();
            await foreach (var entity in query)
            {
                var message = entity.ToChat();
                messages.Add(message);
            }
            var readSequenceId = await _tableClient.GetEntityIfExistsAsync<SessionEntity>(user, pair, SequenceIdColumn);
            var pairReadSequenceId = await _tableClient.GetEntityIfExistsAsync<SessionEntity>(pair, user, SequenceIdColumn);

            return new ChatHistory(user, pair,
                readSequenceId.HasValue ? readSequenceId.Value!.ReadToSequenceId : 0,
                pairReadSequenceId.HasValue ? pairReadSequenceId.Value!.ReadToSequenceId : 0,
                messages);
        }

        public Task ReadTo(string from, string to, long sequenceId)
        {
            return UpdateReadToAysncCore(from, to, sequenceId).WithRetries();
        }

        private async Task<bool> UpdateReadToAysncCore(string from, string to, long sequenceId)
        {
            var resp = await _tableClient.GetEntityIfExistsAsync<SessionEntity>(from, to);

            if (!resp.HasValue)
            {
                await _tableClient.AddEntityAsync(new SessionEntity(from, to, sequenceId));
                return true;
            }

            var entity = resp.Value!;
            if (entity.ReadToSequenceId > sequenceId)
            {
                return false;
            }
            entity.ReadToSequenceId = sequenceId;
            await _tableClient.UpdateEntityAsync(entity, entity.ETag);
            return true;
        }

        public async Task<long> AddMessageAsync(string from, string to, string text)
        {
            var key = GetChatKey(from, to);

            await InsertUserPairAsync(from, to);
            // retry generating the sequenceId if insert fails
            return await InsertChatAsyncCore(key, from, to, text).WithRetries();
        }

        private Task InsertUserPairAsync(string from, string to)
        {
            var entity = new SessionEntity(from, to);
            return _tableClient.UpsertEntityAsync(entity);
        }

        private async Task<long> InsertChatAsyncCore(string key, string from, string to, string text)
        {
            // Use ticks as the sequenceId for simplicity
            var sequenceId = DateTime.UtcNow.Ticks;
            var entity = new ChatEntity(key, sequenceId, from, to, text);
            await _tableClient.AddEntityAsync(entity);
            return sequenceId;
        }

        private string GetChatKey(string from, string to)
        {
            return JsonSerializer.Serialize(new string[] { from, to }.OrderBy(s => s));
        }

        private sealed class SessionEntity : ITableEntity
        {
            // pk(pair1) - rk(pair2) - sequenceId - pair1 readto pair2
            // sender - pair - sequenceId - readto
            public long ReadToSequenceId { get; set; }
            public string PartitionKey { get; set; } = string.Empty;
            public string RowKey { get; set; } = string.Empty;
            public DateTimeOffset? Timestamp { get; set; }
            public ETag ETag { get; set; }

            public SessionEntity() { }

            public SessionEntity(string pkey, string rkey, long readToSequenceId = 0)
            {
                PartitionKey = pkey;
                RowKey = rkey;
                ReadToSequenceId = readToSequenceId;
            }
        }

        private sealed class ChatEntity : ITableEntity
        {
            public string From { get; set; } = string.Empty;
            public string To { get; set; } = string.Empty;
            public string Text { get; set; } = string.Empty;
            public long SequenceId { get; set;}
            public string PartitionKey { get; set; } = string.Empty;
            public string RowKey { get; set; } = string.Empty;
            public DateTimeOffset? Timestamp { get; set; }
            public ETag ETag { get; set; }
            public ChatEntity() { }
            public ChatEntity(string pkey, long rowKey, string from, string to, string text)
            {
                PartitionKey = pkey;
                RowKey = rowKey.ToString();
                From = from;
                To = to;
                Text = text;
                SequenceId = rowKey;
            }

            public Chat ToChat()
            {
                return new Chat(Text, From, To, SequenceId);
            }
        }
    }

    public static class Utilities
    {
        public static async Task<T> WithRetries<T>(this Task<T> task, int retries = 3)
        {
            var retry = 0;
            while (true)
            {
                try
                {
                    return await task;
                }
                catch
                {
                    if (retry == retries)
                    {
                        throw;
                    }

                    retry++;
                    await Task.Delay(1000);
                }
            }
        }
    }
}
