// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Collections.Concurrent;

namespace Microsoft.Azure.WebPubSub.Samples
{
    public class InMemoryUserManager : IUserManager
    {
        private readonly ConcurrentDictionary<string, UserState> _userStorage = new ConcurrentDictionary<string, UserState>();

        public void AddUser(string username)
        {
            _userStorage.AddOrUpdate(username, s => new(username, true), (s, u) =>
            {
                u.online = true;
                return u;
            });
        }

        public void UpdateUserState(string username, bool online)
        {
            _userStorage.AddOrUpdate(username, s => new(username, online), (s, u) =>
            {
                u.online = online;
                return u;
            });
        }

        public UserState[] GetUsers()
        {
            return _userStorage.Values.OrderBy(u => u.name).ToArray();
        }

        public void RemoveUser(string username)
        {
            _userStorage.TryRemove(username, out _);
        }
    }
}
