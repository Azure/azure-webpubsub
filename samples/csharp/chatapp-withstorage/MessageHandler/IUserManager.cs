// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

namespace Microsoft.Azure.SignalR.Samples.ReliableChatRoom
{
    public interface IUserManager
    {
        string[] GetUsers();

        void UpdateUserState(string username, bool online);

        void AddUser(string username);

        void RemoveUser(string username);
    }
}
