// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System;
using System.Collections;
using Meta.Multiplayer.Core;
using UltimateGloveBall.Arena.Services;
using Unity.Netcode;
using UnityEngine;
using Object = UnityEngine.Object;

namespace UltimateGloveBall.App
{
    /// <summary>
    /// Handles the callbacks from the NetworkLayer.
    /// Setup the state of the application based on the connection state of the network layer.
    /// Handles Host connection, Client Connection and Lobby Connection. 
    /// </summary>
    public class NetworkStateHandler
    {
        private MonoBehaviour m_coroutineRunner;
        private NetworkLayer m_networkLayer;
        private NavigationController m_navigationController;
        private VoipController m_voip;
        private LocalPlayerState m_localPlayerState;
        private PlayerPresenceHandler m_playerPresenceHandler;
        private Func<NetworkSession> m_createSessionFunc;
        private NetworkSession m_session;

        private bool IsSpectator => m_localPlayerState.IsSpectator;

        public NetworkStateHandler(
            MonoBehaviour coroutineRunner,
            NetworkLayer networkLayer,
            NavigationController navigationController,
            VoipController voip,
            LocalPlayerState localPlayerState,
            PlayerPresenceHandler playerPresenceHandler,
            Func<NetworkSession> createSessionFunc)
        {
            m_coroutineRunner = coroutineRunner;
            m_networkLayer = networkLayer;
            m_navigationController = navigationController;
            m_voip = voip;
            m_localPlayerState = localPlayerState;
            m_playerPresenceHandler = playerPresenceHandler;
            m_createSessionFunc = createSessionFunc;

            m_networkLayer.OnClientConnectedCallback += OnClientConnected;
            m_networkLayer.OnClientDisconnectedCallback += OnClientDisconnected;
            m_networkLayer.OnMasterClientSwitchedCallback += OnMasterClientSwitched;
            m_networkLayer.StartLobbyCallback += OnLobbyStarted;
            m_networkLayer.StartHostCallback += OnHostStarted;
            m_networkLayer.StartClientCallback += OnClientStarted;
            m_networkLayer.RestoreHostCallback += OnHostRestored;
            m_networkLayer.RestoreClientCallback += OnClientRestored;
            m_networkLayer.OnRestoreFailedCallback += OnRestoreFailed;

            // Functions
            m_networkLayer.GetOnClientConnectingPayloadFunc = GetClientConnectingPayload;
            m_networkLayer.CanMigrateAsHostFunc = CanMigrateAsHost;
        }

        public void Dispose()
        {
            m_networkLayer.OnClientConnectedCallback -= OnClientConnected;
            m_networkLayer.OnClientDisconnectedCallback -= OnClientDisconnected;
            m_networkLayer.OnMasterClientSwitchedCallback -= OnMasterClientSwitched;
            m_networkLayer.StartLobbyCallback -= OnLobbyStarted;
            m_networkLayer.StartHostCallback -= OnHostStarted;
            m_networkLayer.StartClientCallback -= OnClientStarted;
            m_networkLayer.RestoreHostCallback -= OnHostRestored;
            m_networkLayer.RestoreClientCallback -= OnClientRestored;
            m_networkLayer.OnRestoreFailedCallback -= OnRestoreFailed;
        }

        private Coroutine StartCoroutine(IEnumerator routine)
        {
            return m_coroutineRunner.StartCoroutine(routine);
        }

        private void StartVoip(Transform transform)
        {
            m_voip.StartVoip(transform);
        }

        private void SpawnSession()
        {
            m_session = m_createSessionFunc.Invoke();
            // Append Region to lobbyId to ensure unique voice room, since we use only 1 region for voice
            var lobbyId = m_playerPresenceHandler.GroupPresenceState.LobbySessionID;
            m_session.SetPhotonVoiceRoom($"{m_networkLayer.GetRegion()}-{lobbyId}");
            m_session.GetComponent<NetworkObject>().Spawn();
        }

        #region Network Layer Callbacks
        private void OnClientConnected(ulong clientId)
        {
            _ = StartCoroutine(Impl());
            var destinationAPI = m_playerPresenceHandler.GetArenaDestinationAPI(m_networkLayer.GetRegion());
            _ = StartCoroutine(
                m_playerPresenceHandler.GenerateNewGroupPresence(destinationAPI, m_networkLayer.CurrentRoom));

            IEnumerator Impl()
            {
                if (NetworkManager.Singleton.IsHost)
                {
                    yield return new WaitUntil(() => m_session != null);
                    m_session.DetermineFallbackHost(clientId);
                    m_session.UpdatePhotonVoiceRoomToClient(clientId);
                }
                else if (NetworkManager.Singleton.IsClient)
                {
                    m_session = Object.FindObjectOfType<NetworkSession>();

                    var playerPos = m_networkLayer.CurrentClientState == NetworkLayer.ClientState.RestoringClient
                        ? m_localPlayerState.transform.position
                        : Vector3.zero;
                    SpawningManagerBase.Instance.RequestSpawnServerRpc(
                        clientId, m_localPlayerState.PlayerUid, IsSpectator, playerPos);
                }
            }
        }

        private void OnClientDisconnected(ulong clientId)
        {
            if (m_session)
            {
                m_session.RedetermineFallbackHost(clientId);
            }
        }

        private static ulong OnMasterClientSwitched()
        {
            return NetworkSession.FallbackHostId;
        }

        private void OnLobbyStarted()
        {
            Debug.Log("OnLobbyStarted");

            m_navigationController.LoadMainMenu();
        }

        private void OnHostStarted()
        {
            Debug.Log("OnHostStarted");

            m_navigationController.LoadArena();

            _ = StartCoroutine(Impl());

            IEnumerator Impl()
            {
                yield return new WaitUntil(() => m_navigationController.IsSceneLoaded());

                SpawnSession();

                var player = SpawningManagerBase.Instance.SpawnPlayer(NetworkManager.Singleton.LocalClientId,
                    m_localPlayerState.PlayerUid, false, Vector3.zero);

                StartVoip(player.transform);
            }
        }

        private void OnClientStarted()
        {
            var player = NetworkManager.Singleton.SpawnManager.GetLocalPlayerObject();
            StartVoip(player.transform);
        }

        private void OnHostRestored()
        {
            SpawnSession();

            var player = SpawningManagerBase.Instance.SpawnPlayer(NetworkManager.Singleton.LocalClientId,
                m_localPlayerState.PlayerUid, false, m_localPlayerState.transform.position);

            StartVoip(player.transform);
        }

        private void OnClientRestored()
        {
            var player = NetworkManager.Singleton.SpawnManager.GetLocalPlayerObject();
            StartVoip(player.transform);
        }

        private void OnRestoreFailed(int failureCode)
        {
            m_navigationController.GoToMainMenu((ArenaApprovalController.ConnectionStatus)failureCode);
        }

        private string GetClientConnectingPayload()
        {
            return JsonUtility.ToJson(new ArenaApprovalController.ConnectionPayload()
            {
                IsPlayer = !IsSpectator,
            });
        }

        private bool CanMigrateAsHost()
        {
            return !IsSpectator;
        }
        #endregion // Network Layer Callbacks
    }
}