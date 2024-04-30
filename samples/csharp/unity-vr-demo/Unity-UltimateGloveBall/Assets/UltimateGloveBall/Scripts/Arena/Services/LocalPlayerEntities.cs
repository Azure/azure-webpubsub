// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System.Collections.Generic;
using Meta.Utilities;
using Oculus.Interaction;
using Oculus.Interaction.Input;
using UltimateGloveBall.App;
using UltimateGloveBall.Arena.Gameplay;
using UltimateGloveBall.Arena.Player;
using Unity.Netcode;

namespace UltimateGloveBall.Arena.Services
{
    /// <summary>
    /// Tracks the players entities. At the root we have the local player entities (player controller, gloves,
    /// glove armatures, Avatar) and then we keep track of each other players game objects for easy references.
    /// It implements a custom logic to setup the local players entity when all entities are loaded.
    /// This is necessary since the different entities are different networked object that can be loaded in any order
    /// and we need to setup the player only once all their entities are spawned and loaded.
    /// </summary>
    public class LocalPlayerEntities : Singleton<LocalPlayerEntities>
    {
        public PlayerControllerNetwork LocalPlayerController;
        public GloveArmatureNetworking LeftGloveArmature;
        public GloveArmatureNetworking RightGloveArmature;
        public Glove LeftGloveHand;
        public Glove RightGloveHand;
        public PlayerAvatarEntity Avatar;

        private readonly PlayerGameObjects m_localPlayerGameObjects = new();

        private readonly Dictionary<ulong, PlayerGameObjects> m_playerObjects = new();
        public List<ulong> PlayerIds { get; } = new();
        private void Start()
        {
            DontDestroyOnLoad(this);
            var networkLayer = UGBApplication.Instance.NetworkLayer;
            networkLayer.OnClientDisconnectedCallback += OnClientDisconnected;
            networkLayer.StartHostCallback += OnHostStarted;
            networkLayer.RestoreHostCallback += OnHostStarted;
        }

        private void OnDestroy()
        {
            var networkLayer = UGBApplication.Instance.NetworkLayer;
            networkLayer.OnClientDisconnectedCallback -= OnClientDisconnected;
            networkLayer.StartHostCallback -= OnHostStarted;
            networkLayer.RestoreHostCallback -= OnHostStarted;
        }

        public PlayerGameObjects GetPlayerObjects(ulong clientId)
        {
            if (clientId == NetworkManager.Singleton.LocalClientId)
            {
                return m_localPlayerGameObjects;
            }

            if (!m_playerObjects.TryGetValue(clientId, out var playerData))
            {
                playerData = new();
                m_playerObjects[clientId] = playerData;
                if (!PlayerIds.Contains(clientId))
                {
                    PlayerIds.Add(clientId);
                }
            }

            return playerData;
        }

        public void TryAttachGloves()
        {
            if (LeftGloveHand == null || RightGloveHand == null ||
                LeftGloveArmature == null || RightGloveArmature == null ||
                Avatar == null || !Avatar.IsSkeletonReady)
            {
                return;
            }

            if (!PlayerIds.Contains(NetworkManager.Singleton.LocalClientId))
            {
                PlayerIds.Add(NetworkManager.Singleton.LocalClientId);
            }

            m_localPlayerGameObjects.Avatar = Avatar;
            m_localPlayerGameObjects.PlayerController = LocalPlayerController;
            m_localPlayerGameObjects.LeftGloveArmature = LeftGloveArmature;
            m_localPlayerGameObjects.LeftGloveHand = LeftGloveHand;
            m_localPlayerGameObjects.RightGloveArmature = RightGloveArmature;
            m_localPlayerGameObjects.RightGloveHand = RightGloveHand;
            m_localPlayerGameObjects.TryAttachObjects();

            LeftGloveHand.IsMovementEnabled += IsMovementEnabled;
            RightGloveHand.IsMovementEnabled += IsMovementEnabled;


            // We find the interactor to set on the gloves so we know if we hover on UI
            var interactors = FindObjectsOfType<RayInteractor>();
            foreach (var interactor in interactors)
            {
                if (interactor.GetComponent<ControllerRef>().Handedness == Handedness.Left)
                {
                    LeftGloveHand.SetRayInteractor(interactor);
                }
                else
                {
                    RightGloveHand.SetRayInteractor(interactor);
                }
            }


            LocalPlayerController.ArmatureLeft = LeftGloveArmature;
            LocalPlayerController.ArmatureRight = RightGloveArmature;
            LocalPlayerController.GloveRight = RightGloveHand.GloveNetworkComponent;
            LocalPlayerController.GloveLeft = LeftGloveHand.GloveNetworkComponent;

            var team = Avatar.GetComponent<NetworkedTeam>().MyTeam;
            if (team == NetworkedTeam.Team.TeamA)
            {
                PlayerMovement.Instance.SetLimits(-4.5f, 4.5f, -9, -1f);
            }
            else if (team == NetworkedTeam.Team.TeamB)
            {
                PlayerMovement.Instance.SetLimits(-4.5f, 4.5f, 1f, 9);
            }
            else
            {
                PlayerMovement.Instance.SetLimits(-4.5f, 4.5f, -9, 9);
            }

            // Local Player is loaded
            OVRScreenFade.instance.FadeIn();
        }

        private static bool IsMovementEnabled()
        {
            return PlayerInputController.Instance.MovementEnabled;
        }

        private void OnHostStarted()
        {
            PlayerIds.Clear();
            m_playerObjects.Clear();
        }

        private void OnClientDisconnected(ulong clientId)
        {
            _ = PlayerIds.Remove(clientId);
            _ = m_playerObjects.Remove(clientId);
        }
    }
}