// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using Meta.Multiplayer.Core;
using TMPro;
using UltimateGloveBall.App;
using UnityEngine;
using UnityEngine.UI;

namespace UltimateGloveBall.Arena.Player.Menu
{
    /// <summary>
    /// Players information item listed in the Players list on the in game menu.
    /// Shows the player information as well as mute/unmute button and block/unblock button
    /// </summary>
    public class PlayerInfoItem : MonoBehaviour
    {
        private const string BLOCK = "block";
        private const string UNBLOCK = "unblock";
        [SerializeField] private TMP_Text m_usernameText;
        [SerializeField] private Button m_muteButton;
        [SerializeField] private Image m_mutedIcon;
        [SerializeField] private Image m_unmutedIcon;
        [SerializeField] private TMP_Text m_blockButtonText;

        private bool m_isUserMutedState;
        private bool m_isUserBlockedState;
        private PlayerStateNetwork m_playerState;

        public void SetupUser(PlayerStateNetwork playerState)
        {
            m_playerState = playerState;
            m_usernameText.text = playerState.Username;
            m_isUserMutedState = playerState.VoipHandler.IsMuted;
            m_isUserBlockedState = BlockUserManager.Instance.IsUserBlocked(playerState.UserId);
            UpdateState();
        }

        public void OnMuteButtonClicked()
        {
            SetMuteState(!m_isUserMutedState);
        }

        public void OnBlockUserClicked()
        {
            if (m_isUserBlockedState)
            {
                BlockUserManager.Instance.UnblockUser(m_playerState.UserId, OnUnblockSuccess);
            }
            else
            {
                BlockUserManager.Instance.BlockUser(m_playerState.UserId, OnBlockSuccess);
            }
        }

        private void OnBlockSuccess(ulong userId)
        {
            m_isUserBlockedState = true;
            m_playerState.VoipHandler.IsMuted = true;
            UpdateState();
        }

        private void OnUnblockSuccess(ulong userId)
        {
            m_isUserBlockedState = false;
            m_playerState.VoipHandler.IsMuted = UserMutingManager.Instance.IsUserMuted(userId);
            UpdateState();
        }

        private void SetMuteState(bool muted)
        {
            if (muted)
            {
                UserMutingManager.Instance.MuteUser(m_playerState.UserId);
            }
            else
            {
                UserMutingManager.Instance.UnmuteUser(m_playerState.UserId);
            }
            m_isUserMutedState = muted;
            UpdateMuteButton();
        }

        private void UpdateMuteButton()
        {
            var showMute = m_isUserMutedState || m_isUserBlockedState;
            m_mutedIcon.gameObject.SetActive(showMute);
            m_unmutedIcon.gameObject.SetActive(!showMute);
            m_muteButton.interactable = !m_isUserBlockedState;
        }

        private void UpdateBlockButtonState()
        {
            m_blockButtonText.text = m_isUserBlockedState ? UNBLOCK : BLOCK;
        }

        private void UpdateState()
        {
            UpdateMuteButton();
            UpdateBlockButtonState();
        }
    }
}