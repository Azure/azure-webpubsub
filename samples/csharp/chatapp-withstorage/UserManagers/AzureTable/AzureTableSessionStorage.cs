// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Microsoft.Extensions.Configuration;
using Microsoft.WindowsAzure.Storage;
using Microsoft.WindowsAzure.Storage.Table;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Microsoft.Azure.WebPubSub.Samples
{
    public class AzureTableSessionStorage : IUserManager
    {
        private readonly CloudStorageAccount _storageAccount;

        private readonly CloudTableClient _cloudTableClient;

        private readonly CloudTable _sessionTable;

        private readonly IConfiguration _configuration;

        public AzureTableSessionStorage(IConfiguration configuration)
        {
            _configuration = configuration;
            _storageAccount = CloudStorageAccount.Parse(_configuration.GetConnectionString("AzureStorage"));

            _cloudTableClient = _storageAccount.CreateCloudTableClient();

            _sessionTable = _cloudTableClient.GetTableReference("SessionTable");
            _sessionTable.CreateIfNotExistsAsync();
        }

        public async Task<IList<UserState>> GetUsersAsync()
        {
            var query = new TableQuery<SessionEntity>().Where(
                TableQuery.GenerateFilterCondition("PartitionKey", QueryComparisons.Equal, "user-list")
            );
            var result = await _sessionTable.ExecuteQuerySegmentedAsync<SessionEntity>(query, null);

            List<UserState> sessions = new();
            foreach (var entity in result)
            {
                sessions.Add(entity.ToSession());
            }

            return sessions;
        }

        public Task AddUserAsync(string name)
        {
            return _sessionTable.ExecuteAsync(TableOperation.Insert(new SessionEntity("user-list", name, new UserState(name))));
        }
    }
}
