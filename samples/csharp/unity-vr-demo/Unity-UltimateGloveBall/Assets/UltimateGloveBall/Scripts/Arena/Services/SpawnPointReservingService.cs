// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System;
using System.Collections.Generic;
using UnityEngine;
using Random = UnityEngine.Random;

namespace UltimateGloveBall.Arena.Services
{
    /// <summary>
    /// This is a reserving system for spawn points. By keeping track of the points in use, we can ensure that we don't
    /// spawn entities over the same spawn point.
    /// Reserve a random point or a specific one. Release the spawn point when you are done. Or get the transform
    /// of a given spawn point.
    /// </summary>
    public class SpawnPointReservingService : MonoBehaviour
    {
        [SerializeField] private Transform[] m_spawnPoints = Array.Empty<Transform>();

        private readonly List<int> m_openSpawnPoints = new();
        private readonly HashSet<int> m_usedSpawnPoints = new();

        private void Awake()
        {
            Reset();
        }

        public void Reset()
        {
            m_openSpawnPoints.Clear();
            for (var i = 0; i < m_spawnPoints.Length; ++i)
            {
                m_openSpawnPoints.Add(i);
            }
            m_usedSpawnPoints.Clear();
        }

        public Transform ReserveRandomSpawnPoint(out int spawnIndex)
        {
            if (m_openSpawnPoints.Count == 0)
            {
                spawnIndex = -1;
                return null;
            }

            var openIndex = Random.Range(0, m_openSpawnPoints.Count);
            spawnIndex = m_openSpawnPoints[openIndex];
            m_openSpawnPoints.RemoveAt(openIndex);
            _ = m_usedSpawnPoints.Add(spawnIndex);
            return m_spawnPoints[spawnIndex];
        }

        public Transform ReserveClosestSpawnPoint(Vector3 position, out int spawnIndex)
        {
            if (m_openSpawnPoints.Count == 0)
            {
                spawnIndex = -1;
                return null;
            }

            var closestDistSqr = float.MaxValue;
            var openIndex = -1;
            spawnIndex = 0;
            for (var i = 0; i < m_openSpawnPoints.Count; ++i)
            {
                var index = m_openSpawnPoints[i];
                var point = m_spawnPoints[index].position;
                var sqrDist = (position - point).sqrMagnitude;
                if (sqrDist < closestDistSqr)
                {
                    openIndex = i;
                    spawnIndex = index;
                    closestDistSqr = sqrDist;
                }
            }

            m_openSpawnPoints.RemoveAt(openIndex);
            _ = m_usedSpawnPoints.Add(spawnIndex);
            return m_spawnPoints[spawnIndex];
        }

        public void ReleaseSpawnPoint(int spawnIndex)
        {
            if (!m_usedSpawnPoints.Contains(spawnIndex))
            {
                Debug.LogError($"SpawnPoint at index {spawnIndex} wasn't reserved");
                return;
            }

            _ = m_usedSpawnPoints.Remove(spawnIndex);
            m_openSpawnPoints.Add(spawnIndex);
        }

        public Transform ReserveSpawnPoint(int spawnIndex)
        {
            if (m_usedSpawnPoints.Contains(spawnIndex))
            {
                Debug.LogError($"SpawnPoint at index {spawnIndex} already used");
                return null;
            }

            if (spawnIndex < 0 || spawnIndex >= m_spawnPoints.Length)
            {
                Debug.LogError($"SpawnPoint at index {spawnIndex} is out of bounds");
                return null;
            }

            _ = m_openSpawnPoints.Remove(spawnIndex);
            _ = m_usedSpawnPoints.Add(spawnIndex);
            return m_spawnPoints[spawnIndex];
        }

        public Transform GetSpawnPoint(int spawnIndex, bool reserveIfNotReserved)
        {
            if (spawnIndex < 0 || spawnIndex >= m_spawnPoints.Length)
            {
                Debug.LogError($"SpawnPoint at index {spawnIndex} is out of bounds");
                return null;
            }

            if (reserveIfNotReserved)
            {
                _ = m_openSpawnPoints.Remove(spawnIndex);
                _ = m_usedSpawnPoints.Add(spawnIndex);
            }

            return m_spawnPoints[spawnIndex];
        }

    }
}