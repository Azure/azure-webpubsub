// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System;
using System.Collections.Generic;
using System.Runtime.CompilerServices;
using Unity.Netcode;
using UnityEngine;
using UnityEngine.Assertions;

namespace UltimateGloveBall.Networking.Pooling
{
    /// <summary>
    /// This class is used to pool networked objects and provides public methods extracting and returning
    /// those networked objects to a queue.
    /// 
    /// This script is based on the Unity's Network Object pooling tutorial
    /// https://docs-multiplayer.unity3d.com/netcode/current/advanced-topics/object-pooling/index.html
    /// </summary>
    public class NetworkObjectPool : NetworkBehaviour
    {
        [Serializable]
        private struct PoolConfigObject
        {
            public GameObject Prefab;
            public int PrewarmCount;
        }

        #region Fields

        public static NetworkObjectPool Singleton { get; private set; }

        [SerializeField] private List<PoolConfigObject> m_pooledPrefabsList = new();

        private bool m_hasInitialized;

        private readonly HashSet<GameObject> m_prefabs = new();

        private readonly Dictionary<GameObject, Queue<NetworkObject>> m_pooledObjects = new();

        #endregion

        #region Lifecycle

        private void Awake()
        {
            if (Singleton != null && Singleton != this)
                Destroy(gameObject);
            else
                Singleton = this;
        }

        public override void OnNetworkSpawn()
        {
            InitializePool();
        }

        public override void OnNetworkDespawn()
        {
            ClearPool();
        }

        private void OnValidate()
        {
            for (var i = 0; i < m_pooledPrefabsList.Count; i++)
            {
                var prefab = m_pooledPrefabsList[i].Prefab;
                if (prefab != null)
                {
                    Assert.IsNotNull(prefab.GetComponent<NetworkObject>(),
                        $"{nameof(NetworkObjectPool)}: Pooled prefab \"{prefab.name}\" at index {i} has no {nameof(NetworkObject)} component.");
                }
            }
        }

        #endregion

        #region Public Methods

        /// <summary>
        ///     Grab a network object from the pool. Returns the object placed in origin.
        /// </summary>

        public NetworkObject GetNetworkObject(GameObject prefab)
        {
            return GetNetworkObjectInternal(prefab, Vector3.zero, Quaternion.identity);
        }

        /// <summary>
        ///     Grab a network object from the pool. Returns the object placed in a given location.
        /// </summary>
        /// <param name="prefab">The prefab to be dequeued.</param>
        /// <param name="position">Spawn position.</param>
        /// <param name="rotation">Spawn rotation.</param>
        /// <returns>The dequeued networked object.</returns>
        public NetworkObject GetNetworkObject(GameObject prefab, Vector3 position, Quaternion rotation)
        {
            return GetNetworkObjectInternal(prefab, position, rotation);
        }

        /// <summary>
        ///     Return a networked object to the queue of objects connected to a specific prefab.
        /// </summary>
        /// <param name="networkObject">The object to be returned.</param>
        /// <param name="prefab">The prefab which spawns the networked object.</param>
        public void ReturnNetworkObject(NetworkObject networkObject, GameObject prefab)
        {
            var go = networkObject.gameObject;
            go.SetActive(false);
            m_pooledObjects[prefab].Enqueue(networkObject);
        }

        /// <summary>
        ///     Add a new prefab to the pool of networked objects.
        /// </summary>
        /// <param name="prefab">The prefab to pool.</param>
        /// <param name="prewarmCount">How many objects should be spawned (pre-warmed) upon adding the prefab to the pool.</param>
        public void AddPrefab(GameObject prefab, int prewarmCount = 0)
        {
            var networkObject = prefab.GetComponent<NetworkObject>();

            Assert.IsNotNull(networkObject, $"{nameof(prefab)} must have {nameof(networkObject)} component.");
            Assert.IsFalse(m_prefabs.Contains(prefab), $"Prefab {prefab.name} is already registered in the pool.");

            RegisterPrefabInternal(prefab, prewarmCount);
        }

        #endregion

        #region Private Methods

        private NetworkObject GetNetworkObjectInternal(GameObject prefab, Vector3 position, Quaternion rotation)
        {
            var queue = m_pooledObjects[prefab];

            var networkObject = queue.Count > 0 ? queue.Dequeue() : CreateInstance(prefab).GetComponent<NetworkObject>();

            var go = networkObject.gameObject;

            go.SetActive(true);
            go.transform.SetPositionAndRotation(position, rotation);

            return networkObject;
        }

        private void InitializePool()
        {
            if (m_hasInitialized) return;
            foreach (var configObject in m_pooledPrefabsList)
            {
                RegisterPrefabInternal(configObject.Prefab, configObject.PrewarmCount);
            }
        }

        /// <summary>
        ///     Builds up the cache for a prefab.
        /// </summary>
        private void RegisterPrefabInternal(GameObject prefab, int prewarmCount)
        {
            _ = m_prefabs.Add(prefab);

            var prefabQueue = new Queue<NetworkObject>();
            m_pooledObjects[prefab] = prefabQueue;
            for (var i = 0; i < prewarmCount; i++)
            {
                var go = CreateInstance(prefab);
                ReturnNetworkObject(go.GetComponent<NetworkObject>(), prefab);
            }

            _ = NetworkManager.Singleton.PrefabHandler.AddHandler(prefab, new PooledPrefabInstanceHandler(prefab, this));
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        private GameObject CreateInstance(GameObject prefab)
        {
            return Instantiate(prefab);
        }

        /// <summary>
        ///  Unregisters all objects in <see cref="m_pooledPrefabsList"/> from the cache.
        /// </summary>
        private void ClearPool()
        {
            foreach (var prefab in m_prefabs)
            {
                _ = NetworkManager.Singleton.PrefabHandler.RemoveHandler(prefab);
            }

            m_pooledObjects.Clear();
        }

        #endregion
    }
}
