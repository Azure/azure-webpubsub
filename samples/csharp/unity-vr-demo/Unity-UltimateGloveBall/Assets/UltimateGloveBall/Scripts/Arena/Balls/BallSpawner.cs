// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Meta.Utilities;
using UltimateGloveBall.Arena.Gameplay;
using UltimateGloveBall.Design;
using UltimateGloveBall.Networking.Pooling;
using Unity.Netcode;
using UnityEngine;
using Random = UnityEngine.Random;

namespace UltimateGloveBall.Arena.Balls
{
    /// <summary>
    /// Handles the spawning and despawning of the balls using the network object pool for them.
    /// </summary>
    public class BallSpawner : NetworkBehaviour
    {
        #region Fields

        [SerializeField] private List<SpawnPoint> m_ballSpawnPoints;
        [SerializeField] private BallSpawningData m_ballSpawnData;
        private readonly List<BallNetworking> m_balls = new();

        [SerializeField] private float m_respawnDelay = 2;

        public static BallSpawner Instance { get; private set; }

        [SerializeField] private NetworkObjectPool m_ballPool;


        private WaitForSeconds m_despawnWait = new(2f);
        private WaitForSeconds m_respawnWait = null;
        #endregion

        #region Lifecycle

        private void Awake()
        {
            Instance = this;
            m_ballSpawnData.Initialize();
        }

        #endregion

        #region Spawning

        /// <summary>
        ///     Spawns the initial balls at all of the spawn points.
        /// </summary>
        public void SpawnInitialBalls()
        {
            if (!IsServer) return;

            foreach (var spawn in m_ballSpawnPoints)
                SpawnRandomBall(spawn);
        }

        private void SpawnRandomBall(SpawnPoint point)
        {
            var selectedPrefab = GetRandomBall();
            // Get object from pool before spawning
            var networkObject = m_ballPool.GetNetworkObject(selectedPrefab.gameObject, point.transform.position + Vector3.up * 0.35f, Quaternion.identity);
            if (!networkObject.IsSpawned)       // Spawning the ball is only required the first time it is fetched from the pool.
                networkObject.Spawn();

            // Prepare the ball
            var go = networkObject.gameObject;
            go.SetLayerToChilds(ObjectLayers.SPAWN_BALL);
            point.OwnedBall = go;
            var ball = networkObject.GetComponent<BallNetworking>();
            ball.SetSpawnState(true);
            m_balls.Add(ball);
            ball.BallDied += OnBallDied;
        }

        /// <summary>
        ///     Spawns a specific ball at a specific location.
        /// </summary>
        /// <param name="ballToSpawnPrefab">The prefab to spawn. Important: Make sure the prefab has been added to the ball pool.</param>
        /// <param name="position">The position to place the ball.</param>
        /// <param name="orientation">The rotation of the ball.</param>
        /// <returns>The ball instance</returns>
        public BallNetworking SpawnExtraBall(NetworkObject ballToSpawnPrefab, Vector3 position, Quaternion orientation)
        {
            // Get ball from pool before spawning
            var networkObject = m_ballPool.GetNetworkObject(ballToSpawnPrefab.gameObject, position, orientation);
            if (!networkObject.IsSpawned)
                networkObject.Spawn();

            // Prepare the ball
            var ball = networkObject.GetComponent<BallNetworking>();
            ball.SetSpawnState(false);
            m_balls.Add(ball);
            ball.BallDied += OnExtraBallDied;
            return ball;
        }

        #endregion

        #region Despawning

        /// <summary>
        ///     Despawns all balls that are in play. Use this at the end of the game to clear the board.
        /// </summary>
        public void DeSpawnAllBalls()
        {
            if (!IsServer) return;

            foreach (var ball in m_balls)
                ReturnBall(ball);

            m_balls.Clear();

            StopAllCoroutines();        // Stop any coroutine running
        }

        private void OnBallDied(BallNetworking ball, bool dieInstantly)
        {
            ball.BallDied -= OnBallDied;
            DeSpawnBall(ball, !dieInstantly);    // When a ball dies we make sure we let it despawn slowly
        }

        private void OnExtraBallDied(BallNetworking ball, bool dieInstantly)
        {
            ball.BallDied -= OnExtraBallDied;
            DeSpawnBall(ball, !dieInstantly, false);
        }

        /// <summary>
        ///     Despawn a specific ball. Important: Make sure the prefab has been added to the ball pool.
        /// </summary>
        /// <param name="ball">Ball to despawn.</param>
        /// <param name="letDespawnSlowly">If true we spin up a coroutine which holds the ball alive for a moment before despawning it. Respawning a new ball happens instantly regardless.</param>
        /// <param name="respawnNewBall">Setting this to false will not respawn a new ball upon despawning the original ball.</param>
        public void DeSpawnBall(BallNetworking ball, bool letDespawnSlowly = true, bool respawnNewBall = true)
        {
            ball.BallDied -= OnBallDied;

            if (letDespawnSlowly)
                _ = StartCoroutine(DeSpawnBallCoroutine(ball));
            else
                DeSpawnBallNow(ball);

            if (respawnNewBall)
                _ = StartCoroutine(RespawnSingleBall());
        }

        private IEnumerator DeSpawnBallCoroutine(BallNetworking ball)
        {
            yield return m_despawnWait;

            if (ball == null)       // In case ball is already de-spawned we should break   
                yield break;

            DeSpawnBallNow(ball);
        }

        private void DeSpawnBallNow(BallNetworking ball)
        {
            _ = m_balls.Remove(ball);
            ReturnBall(ball);
        }

        #endregion

        #region Respawning

        private IEnumerator RespawnSingleBall()
        {
            if (!IsServer) yield break;

            m_respawnWait ??= new WaitForSeconds(m_respawnDelay);
            yield return m_respawnWait;     // Wait a couple of seconds before respawning a ball to avoid spamming balls

            var availableSpawns = m_ballSpawnPoints.Where(s => s.Claimed == false).ToArray();

            if (availableSpawns.Length <= 0) yield break;

            var spawnPoint = availableSpawns[Random.Range(0, availableSpawns.Length)];
            SpawnRandomBall(spawnPoint);
        }

        #endregion

        #region Utility

        private void ReturnBall(NetworkBehaviour ball)
        {
            // Despawning the balls will return them to the pool. PooledPrefabInstanceHandler.cs makes sure of that
            if (ball.NetworkObject.IsSpawned)
                ball.NetworkObject.Despawn();
        }

        private NetworkObject GetRandomBall()
        {
            return m_ballSpawnData.GetRandomBall();
        }

        #endregion
    }
}
