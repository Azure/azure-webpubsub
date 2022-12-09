// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Microsoft.Extensions.Configuration;
using Microsoft.WindowsAzure.Storage;
using Microsoft.WindowsAzure.Storage.Table;
using Newtonsoft.Json;

using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Microsoft.Azure.WebPubSub.Samples
{
    public class AzureTableChatStorage : IChatHandler
    {
        private readonly CloudStorageAccount _storageAccount;

        private readonly CloudTableClient _cloudTableClient;

        private readonly CloudTable _messageTable;

        private readonly IConfiguration _configurationuration;

        public AzureTableChatStorage(IConfiguration configuration)
        {
            _configurationuration = configuration;
            _storageAccount = CloudStorageAccount.Parse(_configurationuration.GetConnectionString("AzureStorage"));

            _cloudTableClient = _storageAccount.CreateCloudTableClient();

            _messageTable = _cloudTableClient.GetTableReference("MessageTable");
            _messageTable.CreateIfNotExistsAsync();
        }

        public async Task<ChatHistory> LoadHistoryMessageAsync(string user, string pair)
        {
            var key = GetKey(user, pair);
            var query = new TableQuery<ChatEntity>().Where(
                TableQuery.GenerateFilterCondition("PartitionKey", QueryComparisons.Equal, key)
            );
            var result = await _messageTable.ExecuteQuerySegmentedAsync(query, null);

            var messages = new List<Chat>();

            foreach (var entity in result)
            {
                messages.Add(entity.ToChat());
            }

            var history = new ChatHistory(user, pair, null, null, messages);
            return history;
        }

        public Task<int> AddMessageAsync(string from, string to, string text)
        {
            // How to get incremental sequenceId using Azure Table? 
            var messageTime = DateTime.Now.Ticks.ToString();
            var messageEntity = new ChatEntity(sessionId, messageTime, text);
            TableOperation insertOperation = TableOperation.Insert(messageEntity);
            var task = await _messageTable.ExecuteAsync(insertOperation);

            return messageTime;
        }

        public Task ReadTo(string from, string to, int sequenceId)
        {
            throw new NotImplementedException();
        }
        private string GetKey(string from, string to)
        {
            return JsonConvert.SerializeObject(new string[] { from, to }.OrderBy(s => s));
        }
    }
}
