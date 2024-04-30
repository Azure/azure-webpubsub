// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System;
using System.Collections.Generic;
using Unity.Netcode;
using UnityEngine;
using Random = UnityEngine.Random;

namespace UltimateGloveBall.Design
{
    /// <summary>
    /// Configurable scriptable object to define the ball types that can be randomly spawn and their weight for the
    /// randomization function.
    /// </summary>
    [CreateAssetMenu(fileName = "BallSpawnData", menuName = "Ball Spawn Data")]
    public class BallSpawningData : ScriptableObject
    {
        [Serializable]
        public struct BallWeight
        {
            public NetworkObject BallPrefab;
            public int Weight;
        }

        [SerializeField] private List<BallWeight> m_ballsToSpawn;

        private int m_ballCount;
        private int m_totalWeight;

        private void Awake()
        {
            Initialize();
        }

        public void Initialize()
        {
            Rebuild();
        }

        public NetworkObject GetRandomBall()
        {
            if (m_ballCount != m_ballsToSpawn.Count)
            {
                Rebuild();
            }
            var rng = Random.Range(0, m_totalWeight);
            var cumWeight = 0;
            for (var i = 0; i < m_ballCount; i++)
            {
                var ballInfo = m_ballsToSpawn[i];
                cumWeight += ballInfo.Weight;
                if (rng <= cumWeight)
                {
                    return ballInfo.BallPrefab;
                }
            }

            // if we didn't find a ball we take the default one
            return m_ballsToSpawn[0].BallPrefab;
        }

        [ContextMenu("Update Data")]
        private void Rebuild()
        {
            m_totalWeight = 0;
            foreach (var ballInfo in m_ballsToSpawn)
            {
                m_totalWeight += ballInfo.Weight;
            }

            m_ballCount = m_ballsToSpawn.Count;
        }
    }
}