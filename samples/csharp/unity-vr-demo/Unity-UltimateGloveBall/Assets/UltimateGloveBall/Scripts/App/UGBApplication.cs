// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System.Collections;
using System.Threading.Tasks;
using Meta.Multiplayer.Core;
using Meta.Utilities;
using Oculus.Platform;
using UnityEngine;

namespace UltimateGloveBall.App
{
    /// <summary>
    /// This is the Entry Point of the whole Ultimate Glove Ball application.
    /// Initializes the core of the application on Start, loads controllers and handlers.
    /// This singleton also exposes controllers and handlers to be used through the application.
    /// Initializes the Oculus Platform, fetch the player state on login and handles join intent.
    /// </summary>
    public class UGBApplication : Singleton<UGBApplication>
    {
        public NetworkLayer NetworkLayer;
        public VoipController Voip;
        [SerializeField] private NetworkSession m_sessionPrefab;

        private LaunchType m_launchType;

        private LocalPlayerState LocalPlayerState => LocalPlayerState.Instance;

        public NavigationController NavigationController { get; private set; }
        public PlayerPresenceHandler PlayerPresenceHandler { get; private set; }
        public NetworkStateHandler NetworkStateHandler { get; private set; }

        protected override void InternalAwake()
        {
            DontDestroyOnLoad(this);
        }

        private void OnDestroy()
        {
            NetworkStateHandler?.Dispose();
        }

        private void Start()
        {
            if (UnityEngine.Application.isEditor)
            {
                if (NetworkSettings.Autostart)
                {
                    LocalPlayerState.SetApplicationID(
                        NetworkSettings.UseDeviceRoom ? SystemInfo.deviceUniqueIdentifier : NetworkSettings.RoomName);
                }
            }

            _ = StartCoroutine(Init());
        }

        private IEnumerator Init()
        {
            _ = InitializeOculusModules();

            // Initialize Player Presence
            PlayerPresenceHandler = new PlayerPresenceHandler();
            yield return PlayerPresenceHandler.Init();
#if !UNITY_EDITOR && !UNITY_STANDALONE_WIN
            yield return new WaitUntil(() => !string.IsNullOrWhiteSpace(LocalPlayerState.Username));
#else
            m_launchType = LaunchType.Normal;
#endif
            _ = BlockUserManager.Instance.Initialize();
            NavigationController =
                new NavigationController(this, NetworkLayer, LocalPlayerState, PlayerPresenceHandler);
            NetworkStateHandler = new NetworkStateHandler(this, NetworkLayer, NavigationController, Voip,
                LocalPlayerState, PlayerPresenceHandler, InstantiateSession);

            if (m_launchType == LaunchType.Normal)
            {
                if (LocalPlayerState.HasCustomAppId)
                {
                    StartCoroutine(PlayerPresenceHandler.GenerateNewGroupPresence(
                        "Arena",
                        $"{LocalPlayerState.ApplicationID}"));
                }
                else
                {
                    StartCoroutine(
                        PlayerPresenceHandler.GenerateNewGroupPresence(
                            "MainMenu")
                    );
                }
            }

            yield return new WaitUntil(() => PlayerPresenceHandler.GroupPresenceState is { Destination: { } });

            NetworkLayer.Init(
                PlayerPresenceHandler.GroupPresenceState.LobbySessionID,
                PlayerPresenceHandler.GetRegionFromDestination(PlayerPresenceHandler.GroupPresenceState.Destination));
        }

        private async Task InitializeOculusModules()
        {
            try
            {
                var coreInit = await Core.AsyncInitialize().Gen();
                if (coreInit.IsError)
                {
                    LogError("Failed to initialize Oculus Platform SDK", coreInit.GetError());
                    return;
                }

                Debug.Log("Oculus Platform SDK initialized successfully");

                var isUserEntitled = await Entitlements.IsUserEntitledToApplication().Gen();
                if (isUserEntitled.IsError)
                {
                    LogError("You are not entitled to use this app", isUserEntitled.GetError());
                    return;
                }

                m_launchType = ApplicationLifecycle.GetLaunchDetails().LaunchType;

                GroupPresence.SetJoinIntentReceivedNotificationCallback(OnJoinIntentReceived);
                GroupPresence.SetInvitationsSentNotificationCallback(OnInvitationsSent);

                var getLoggedInuser = await Users.GetLoggedInUser().Gen();
                if (getLoggedInuser.IsError)
                {
                    LogError("Cannot get user info", getLoggedInuser.GetError());
                    return;
                }

                // Workaround.
                // At the moment, Platform.Users.GetLoggedInUser() seems to only be returning the user ID.
                // Display name is blank.
                // Platform.Users.Get(ulong userID) returns the display name.
                var getUser = await Users.Get(getLoggedInuser.Data.ID).Gen();
                LocalPlayerState.Init(getUser.Data.DisplayName, getUser.Data.ID);
            }
            catch (System.Exception exception)
            {
                Debug.LogException(exception);
            }
        }

        private void OnJoinIntentReceived(Message<Oculus.Platform.Models.GroupPresenceJoinIntent> message)
        {
            Debug.Log("------JOIN INTENT RECEIVED------");
            Debug.Log("Destination:       " + message.Data.DestinationApiName);
            Debug.Log("Lobby Session ID:  " + message.Data.LobbySessionId);
            Debug.Log("Match Session ID:  " + message.Data.MatchSessionId);
            Debug.Log("Deep Link Message: " + message.Data.DeeplinkMessage);
            Debug.Log("--------------------------------");

            var messageLobbySessionId = message.Data.LobbySessionId;

            // no Group Presence yet:
            // app is being launched by this join intent, either
            // through an in-app direct invite, or through a deeplink
            if (PlayerPresenceHandler.GroupPresenceState == null)
            {
                var lobbySessionID = message.Data.DestinationApiName.StartsWith("Arena") && !string.IsNullOrEmpty(messageLobbySessionId)
                    ? messageLobbySessionId
                    : "Arena-" + LocalPlayerState.ApplicationID;

                _ = StartCoroutine(PlayerPresenceHandler.GenerateNewGroupPresence(
                    message.Data.DestinationApiName,
                    lobbySessionID));
            }
            // game was already running, meaning the user already has a Group Presence, and
            // is already either hosting or a client of another host.
            else
            {
                NavigationController.SwitchRoomFromInvite(
                    message.Data.DestinationApiName, messageLobbySessionId, false, false);
            }
        }

        private void OnInvitationsSent(Message<Oculus.Platform.Models.LaunchInvitePanelFlowResult> message)
        {
            Debug.Log("-------INVITED USERS LIST-------");
            Debug.Log("Size: " + message.Data.InvitedUsers.Count);
            foreach (var user in message.Data.InvitedUsers)
            {
                Debug.Log("Username: " + user.DisplayName);
                Debug.Log("User ID:  " + user.ID);
            }

            Debug.Log("--------------------------------");
        }

        private void LogError(string message, Oculus.Platform.Models.Error error)
        {
            Debug.LogError(message);
            Debug.LogError("ERROR MESSAGE:   " + error.Message);
            Debug.LogError("ERROR CODE:      " + error.Code);
            Debug.LogError("ERROR HTTP CODE: " + error.HttpCode);
        }

        private NetworkSession InstantiateSession()
        {
            return Instantiate(m_sessionPrefab);
        }
    }
}