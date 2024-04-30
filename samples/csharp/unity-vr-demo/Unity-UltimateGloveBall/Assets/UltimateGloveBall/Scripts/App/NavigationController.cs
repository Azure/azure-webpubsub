// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System.Collections;
using Meta.Multiplayer.Core;
using UltimateGloveBall.Arena.Services;
using UltimateGloveBall.MainMenu;
using UnityEngine;

namespace UltimateGloveBall.App
{
    /// <summary>
    /// Handles the Navigation through the application.
    /// Expose API to navigate between game state: MainMenu, Play, Spectate. Or specifically load scenes.
    /// Navigating through the different scenes based on the application state.
    /// </summary>
    public class NavigationController
    {
        private readonly SceneLoader m_sceneLoader = new();

        private MonoBehaviour m_coroutineRunner;
        private NetworkLayer m_networkLayer;
        private PlayerPresenceHandler m_playerPresenceHandler;
        private LocalPlayerState m_localPlayerState;

        public NavigationController(MonoBehaviour coroutineRunner, NetworkLayer networkLayer, LocalPlayerState localPlayerState, PlayerPresenceHandler playerPresenceHandler)
        {
            m_coroutineRunner = coroutineRunner;
            m_networkLayer = networkLayer;
            m_localPlayerState = localPlayerState;
            m_playerPresenceHandler = playerPresenceHandler;
        }

        public bool IsSceneLoaded()
        {
            return m_sceneLoader.SceneLoaded;
        }

        public void LoadMainMenu()
        {
            m_sceneLoader.LoadScene("MainMenu", false);
        }

        public void LoadArena()
        {
            m_sceneLoader.LoadScene("Arena");
        }

        public void GoToMainMenu(ArenaApprovalController.ConnectionStatus connectionStatus = ArenaApprovalController.ConnectionStatus.Success)
        {
            m_networkLayer.Leave();

            IEnumerator GoToLobbyAfterLeaving()
            {
                if (OVRScreenFade.instance.currentAlpha < 1)
                {
                    OVRScreenFade.instance.FadeOut();
                }
                yield return new WaitUntil(() => m_networkLayer.CurrentClientState == NetworkLayer.ClientState.Disconnected && OVRScreenFade.instance.currentAlpha >= 1);
                m_networkLayer.GoToLobby();
                yield return new WaitUntil(() => m_networkLayer.CurrentClientState == NetworkLayer.ClientState.ConnectedToLobby);
                yield return new WaitUntil(() => m_sceneLoader.SceneLoaded);
                if (OVRScreenFade.instance.currentAlpha >= 1)
                {
                    OVRScreenFade.instance.FadeIn();
                }
                yield return GenerateNewGroupPresence("MainMenu");
                var menuController = Object.FindObjectOfType<MainMenuController>();
                if (menuController)
                {
                    menuController.OnReturnToMenu(connectionStatus);
                }
            }

            _ = StartCoroutine(GoToLobbyAfterLeaving());
        }

        // only called locally, by owner
        public void NavigateToMatch(bool isHosting)
        {
            _ = StartCoroutine(SwitchRoomOnPhotonReady(m_playerPresenceHandler.GetArenaDestinationAPI(m_networkLayer.GetRegion()), m_playerPresenceHandler.GroupPresenceState.LobbySessionID, isHosting));
        }

        public void JoinMatch(string destinationAPI, string sessionId)
        {
            _ = StartCoroutine(SwitchRoomOnPhotonReady(destinationAPI, sessionId, false));
        }

        public void WatchRandomMatch()
        {
            _ = StartCoroutine(SwitchRoomOnPhotonReady(m_playerPresenceHandler.GetArenaDestinationAPI(m_networkLayer.GetRegion()), "", false, true));
        }

        public void WatchMatch(string destinationAPI, string sessionId)
        {
            _ = StartCoroutine(SwitchRoomOnPhotonReady(destinationAPI, sessionId, false, true));
        }

        public void SwitchRoomFromInvite(string destination, string lobbySessionID, bool isHosting, bool isSpectator)
        {
            _ = StartCoroutine(SwitchRoom(destination, lobbySessionID, isHosting, isSpectator));
        }

        private IEnumerator SwitchRoomOnPhotonReady(string roomName, string lobbySessionId, bool isHosting, bool isSpectator = false)
        {
            //Wait until the current frame has ended to allow everything to initialize
            yield return new WaitForEndOfFrame();

            _ = StartCoroutine(SwitchRoom(roomName, lobbySessionId, isHosting, isSpectator));
        }

        private IEnumerator SwitchRoom(string destination, string lobbySessionID, bool isHosting, bool isSpectator)
        {
            Debug.Log($"Switching room to {destination} as {(isHosting ? "host" : "client")}{(isSpectator ? " spectator" : "")}");

            OVRScreenFade.instance.FadeOut();

            yield return StartCoroutine(GenerateNewGroupPresence(destination, lobbySessionID));
            yield return StartCoroutine(new WaitUntil(() => OVRScreenFade.instance.currentAlpha >= 1));
            Debug.LogWarning($"Switching to room {lobbySessionID} in {destination}");
            m_localPlayerState.IsSpectator = isSpectator;
            m_networkLayer.SwitchPhotonRealtimeRoom(lobbySessionID, isHosting, m_playerPresenceHandler.GetRegionFromDestination(destination));
        }

        private IEnumerator GenerateNewGroupPresence(string destination, string lobbySessionId = null)
        {
            return m_playerPresenceHandler.GenerateNewGroupPresence(destination, lobbySessionId);
        }

        private Coroutine StartCoroutine(IEnumerator routine)
        {
            return m_coroutineRunner.StartCoroutine(routine);
        }
    }
}