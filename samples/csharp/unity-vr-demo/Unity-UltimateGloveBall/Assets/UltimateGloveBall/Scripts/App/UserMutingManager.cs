// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System;
using System.Collections.Generic;

namespace UltimateGloveBall.App
{
    /// <summary>
    /// Manages muting users voice. It keeps track of the users mute state.
    /// Register callbacks to receive notifications when the mute state changes for a user.
    /// </summary>
    public class UserMutingManager
    {
        private static UserMutingManager s_instance;

        public static UserMutingManager Instance
        {
            get
            {
                s_instance ??= new UserMutingManager();

                return s_instance;
            }
        }

        private HashSet<ulong> m_mutedUsers = new();

        private Action<ulong, bool> m_onUserMutedStateCallback;

        private UserMutingManager()
        {
        }

        public void RegisterCallback(Action<ulong, bool> mutedStateCallback)
        {
            m_onUserMutedStateCallback += mutedStateCallback;
        }

        public void UnregisterCallback(Action<ulong, bool> mutedStateCallback)
        {
            m_onUserMutedStateCallback -= mutedStateCallback;
        }

        public bool IsUserMuted(ulong userId)
        {
            return m_mutedUsers.Contains(userId);
        }

        public void MuteUser(ulong userId)
        {
            _ = m_mutedUsers.Add(userId);
            m_onUserMutedStateCallback?.Invoke(userId, true);
        }

        public void UnmuteUser(ulong userId)
        {
            _ = m_mutedUsers.Remove(userId);
            m_onUserMutedStateCallback?.Invoke(userId, false);
        }
    }
}