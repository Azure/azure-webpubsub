// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Collections.Concurrent;

namespace Microsoft.Azure.WebPubSub.Samples
{
    public class InMemoryUserManager : IUserManager
    {
        private readonly ConcurrentDictionary<string, UserState> _userStorage = new ConcurrentDictionary<string, UserState>();

        public Task AddUserAsync(string name)
        {
            _userStorage.GetOrAdd(name, _ => new UserState(name));
            return Task.CompletedTask;
        }

        public Task<IList<UserState>> GetUsersAsync()
        {
            return Task.FromResult(_userStorage.Values.OrderBy(u => u.name).ToArray() as IList<UserState>);
        }

        public void RemoveUser(string name)
        {
            _userStorage.TryRemove(name, out _);
        }
    }
}
