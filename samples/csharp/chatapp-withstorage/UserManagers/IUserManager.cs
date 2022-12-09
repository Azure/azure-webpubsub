// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

namespace Microsoft.Azure.WebPubSub.Samples
{
    public interface IUserManager
    {
        UserState[] GetUsers();

        void UpdateUserState(string username, bool online);

        void AddUser(string username);

        void RemoveUser(string username);
    }

    public record UserState(string name, bool online)
    {
        public bool online { get; set; } = online;
    }
}
