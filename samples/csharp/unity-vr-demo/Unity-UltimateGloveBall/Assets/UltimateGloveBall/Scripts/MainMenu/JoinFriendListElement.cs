// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using Oculus.Platform;
using Oculus.Platform.Models;
using TMPro;
using UltimateGloveBall.App;
using UnityEngine;
using UnityEngine.UI;

namespace UltimateGloveBall.MainMenu
{
    /// <summary>
    /// Element that shows the friends user information and state, and handles button clicks.
    /// </summary>
    public class JoinFriendListElement : MonoBehaviour
    {
        [SerializeField] private TMP_Text m_usernameText;
        [SerializeField] private TMP_Text m_destinationText;
        [SerializeField] private Button m_joinButton;
        [SerializeField] private Button m_watchButton;

        private FriendsMenuController m_friendsMenuController;
        private User m_user;

        public void Init(FriendsMenuController menuController, User user)
        {
            m_friendsMenuController = menuController;
            m_user = user;
            m_usernameText.text = user.DisplayName;

            var canJoin = user.PresenceStatus == UserPresenceStatus.Online &&
                          (!string.IsNullOrEmpty(user.PresenceMatchSessionId) ||
                           !string.IsNullOrEmpty(user.PresenceLobbySessionId));
            m_joinButton.gameObject.SetActive(canJoin);
            m_watchButton.gameObject.SetActive(canJoin);

            m_destinationText.text = user.PresenceStatus == UserPresenceStatus.Online
                ? UGBApplication.Instance.PlayerPresenceHandler.GetDestinationDisplayName(user.PresenceDestinationApiName)
                : "Offline";
        }

        public void OnJoinClicked()
        {
            if (m_user != null)
            {
                var sessionId = m_user.PresenceLobbySessionId ?? m_user.PresenceMatchSessionId;
                if (!string.IsNullOrEmpty(sessionId))
                {
                    m_friendsMenuController.OnJoinMatchClicked(m_user.PresenceDestinationApiName, sessionId);
                }
            }
        }

        public void OnWatchClicked()
        {
            if (m_user != null)
            {
                var sessionId = m_user.PresenceLobbySessionId ?? m_user.PresenceMatchSessionId;
                if (!string.IsNullOrEmpty(sessionId))
                {
                    m_friendsMenuController.OnWatchMatchClicked(m_user.PresenceDestinationApiName, sessionId);
                }
            }
        }
    }
}