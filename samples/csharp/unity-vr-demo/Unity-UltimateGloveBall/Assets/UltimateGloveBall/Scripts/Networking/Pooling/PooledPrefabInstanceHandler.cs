// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using Unity.Netcode;
using UnityEngine;

namespace UltimateGloveBall.Networking.Pooling
{
    /// <summary>
    /// Handles the pooled instances for the NetworkObjectPool.
    ///
    /// This script is based on the Unity's Network Object pooling tutorial
    /// https://docs-multiplayer.unity3d.com/netcode/current/advanced-topics/object-pooling/index.html
    /// </summary>
    public class PooledPrefabInstanceHandler : INetworkPrefabInstanceHandler
    {
        public readonly GameObject Prefab;
        public readonly NetworkObjectPool Pool;

        public PooledPrefabInstanceHandler(GameObject prefab, NetworkObjectPool pool)
        {
            Prefab = prefab;
            Pool = pool;
        }

        public NetworkObject Instantiate(ulong ownerClientId, Vector3 position, Quaternion rotation)
        {
            var netObject = Pool.GetNetworkObject(Prefab, position, rotation);
            return netObject;
        }

        public void Destroy(NetworkObject networkObject)
        {
            Pool.ReturnNetworkObject(networkObject, Prefab);
        }
    }
}
