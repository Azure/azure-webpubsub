// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System.Collections.Generic;
using Oculus.Platform;
using UltimateGloveBall.App;
using UnityEngine;

namespace UltimateGloveBall.MainMenu
{
    /// <summary>
    /// Controls the friends menu view. Loads the users firends using the Platform API and setup the friends list.
    /// Handles actions to join or watch a friend and navigate to their arena.
    /// </summary>
    public class FriendsMenuController : BaseMenuController
    {
        [SerializeField] private JoinFriendListElement m_friendListElementPrefab;
        [SerializeField] private Transform m_contentTransform;

        [SerializeField] private List<JoinFriendListElement> m_spawnedElements;

        [SerializeField] private MainMenuController m_mainMenuController;

        [SerializeField] private GameObject m_noFriendsMessage;

        public void OnEnable()
        {
            HideAllFriends();
            _ = Users.GetLoggedInUserFriends().OnComplete(OnFriendListReceived);
        }

        public void OnJoinMatchClicked(string destinationAPI, string sessionId)
        {
            m_mainMenuController.DisableButtons();
            UGBApplication.Instance.NavigationController.JoinMatch(destinationAPI, sessionId);
        }

        public void OnWatchMatchClicked(string destinationAPI, string sessionId)
        {
            m_mainMenuController.DisableButtons();
            UGBApplication.Instance.NavigationController.WatchMatch(destinationAPI, sessionId);
        }

        private void OnFriendListReceived(Message<Oculus.Platform.Models.UserList> users)
        {
            var i = 0;
            foreach (var user in users.Data)
            {
                if (i >= m_spawnedElements.Count)
                {
                    SpawnNewFriendElement();
                }

                m_spawnedElements[i].Init(this, user);
                m_spawnedElements[i].gameObject.SetActive(true);
                i++;
            }

            m_noFriendsMessage.SetActive(users.Data.Count == 0);
        }

        private void HideAllFriends()
        {
            foreach (var friendElem in m_spawnedElements)
            {
                friendElem.gameObject.SetActive(false);
            }
        }

        private void SpawnNewFriendElement()
        {
            m_spawnedElements.Add(Instantiate(m_friendListElementPrefab, m_contentTransform, false));
        }
    }
}