// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using UltimateGloveBall.App;
using UltimateGloveBall.Arena.Gameplay;
using Unity.Netcode;
using UnityEngine;

namespace UltimateGloveBall.Arena.Services
{
    /// <summary>
    /// This is the base class for any spawning logic in a networked scene. When a player request to be spawned it will
    /// call the inherited class SpawnPlayer implementation.
    /// </summary>
    public abstract class SpawningManagerBase : NetworkBehaviour
    {
        public static SpawningManagerBase Instance;

        protected virtual void Awake()
        {
            Debug.Assert(Instance == null, "Should have only one instance of SpawningManager");
            Instance = this;
            UGBApplication.Instance.NetworkLayer.OnClientDisconnectedCallback += OnClientDisconnected;
        }

        public override void OnDestroy()
        {
            UGBApplication.Instance.NetworkLayer.OnClientDisconnectedCallback -= OnClientDisconnected;
            if (Instance == this)
            {
                Instance = null;
            }
        }

        public abstract NetworkObject SpawnPlayer(ulong clientId, string playerId, bool isSpectator, Vector3 playerPos);

        public abstract void GetRespawnPoint(ulong clientId, NetworkedTeam.Team team,
            out Vector3 position, out Quaternion rotation);

        [ServerRpc(RequireOwnership = false)]
        public void RequestSpawnServerRpc(ulong clientId, string playerId, bool isSpectator, Vector3 playerPos)
        {
            _ = SpawnPlayer(clientId, playerId, isSpectator, playerPos);
        }

        protected virtual void OnClientDisconnected(ulong clientId)
        {
        }
    }
}