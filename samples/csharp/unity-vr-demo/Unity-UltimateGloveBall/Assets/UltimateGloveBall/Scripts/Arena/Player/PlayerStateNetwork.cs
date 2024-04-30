// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using Meta.Multiplayer.Core;
using UltimateGloveBall.App;
using Unity.Collections;
using Unity.Netcode;
using UnityEngine;

namespace UltimateGloveBall.Arena.Player
{
    /// <summary>
    /// Keeps track of the players state and sync's it over the network to other client.
    /// It also handles updating the player name visual and the voip mute/unmute state. 
    /// </summary>
    public class PlayerStateNetwork : NetworkBehaviour
    {
        [SerializeField] private PlayerNameVisual m_playerNameVisual;
        [SerializeField] private bool m_enableLocalPlayerName;
        [SerializeField] private VoipHandler m_voipHandler;

        private NetworkVariable<FixedString128Bytes> m_username = new(
            writePerm: NetworkVariableWritePermission.Owner);
        private NetworkVariable<ulong> m_userId = new(
            writePerm: NetworkVariableWritePermission.Owner);
        private NetworkVariable<bool> m_isMasterClient = new(
            true,
            writePerm: NetworkVariableWritePermission.Owner);

        public string Username => m_username.Value.ToString();
        public ulong UserId => m_userId.Value;

        public VoipHandler VoipHandler => m_voipHandler;

        private LocalPlayerState LocalPlayerState => IsOwner ? LocalPlayerState.Instance : null;

        private void Start()
        {
            OnUsernameChanged(m_username.Value, m_username.Value);
            OnUserIdChanged(m_userId.Value, m_userId.Value);
            OnMasterClientChanged(m_isMasterClient.Value, m_isMasterClient.Value);

            UserMutingManager.Instance.RegisterCallback(OnUserMuteStateChanged);

            if (!LocalPlayerState) return;

            // We snap local player rig to the spawned position of this player.
            PlayerMovement.Instance.SnapPositionToTransform(transform);
            LocalPlayerState.OnChange += UpdateData;

            UpdateData();
        }

        public override void OnDestroy()
        {
            base.OnDestroy();

            UserMutingManager.Instance.UnregisterCallback(OnUserMuteStateChanged);

            if (!LocalPlayerState) return;

            var thisTransform = transform;
            var playerTransform = LocalPlayerState.transform;
            playerTransform.position = thisTransform.position;
            playerTransform.rotation = thisTransform.rotation;

            LocalPlayerState.OnChange -= UpdateData;
        }

        private void OnEnable()
        {
            m_username.OnValueChanged += OnUsernameChanged;
            m_userId.OnValueChanged += OnUserIdChanged;
            m_isMasterClient.OnValueChanged += OnMasterClientChanged;

            if (m_playerNameVisual != null)
                m_playerNameVisual.SetEnableState(m_enableLocalPlayerName);
        }

        private void OnDisable()
        {
            m_username.OnValueChanged -= OnUsernameChanged;
            m_userId.OnValueChanged -= OnUserIdChanged;
            m_isMasterClient.OnValueChanged -= OnMasterClientChanged;
        }

        public override void OnNetworkSpawn()
        {
            base.OnNetworkSpawn();

            if (m_playerNameVisual != null)
                m_playerNameVisual.SetEnableState(m_enableLocalPlayerName || LocalPlayerState == null);

            if (LocalPlayerState)
            {
                // When object is spawned we snap local player rig to the spawned position of this player.
                PlayerMovement.Instance.SnapPositionToTransform(transform);

                SetState(LocalPlayerState.Username, LocalPlayerState.UserId);
                SetIsMaster(IsHost);
            }
        }

        private void UpdateData()
        {
            SetState(LocalPlayerState.Username, LocalPlayerState.UserId);
        }

        private void SetState(string username, ulong userId)
        {
            m_username.Value = username;
            m_userId.Value = userId;
        }

        private void SetIsMaster(bool isMasterClient)
        {
            m_isMasterClient.Value = isMasterClient;
        }

        private void OnUserIdChanged(ulong prevUserId, ulong newUserId)
        {
            if (newUserId != 0)
            {
                m_voipHandler.IsMuted = BlockUserManager.Instance.IsUserBlocked(newUserId) ||
                                        UserMutingManager.Instance.IsUserMuted(newUserId);
            }
        }

        private void OnUsernameChanged(FixedString128Bytes oldName, FixedString128Bytes newName)
        {
            if (m_playerNameVisual != null)
            {
                m_playerNameVisual.SetUsername(newName.ConvertToString());
            }
        }

        private void OnMasterClientChanged(bool oldVal, bool newVal)
        {
            if (m_playerNameVisual != null)
            {
                m_playerNameVisual.ShowMasterIcon(newVal);
            }
        }

        private void OnUserMuteStateChanged(ulong userId, bool isMuted)
        {
            if (userId == m_userId.Value)
            {
                m_voipHandler.IsMuted = isMuted || BlockUserManager.Instance.IsUserBlocked(userId);
            }
        }
    }
}