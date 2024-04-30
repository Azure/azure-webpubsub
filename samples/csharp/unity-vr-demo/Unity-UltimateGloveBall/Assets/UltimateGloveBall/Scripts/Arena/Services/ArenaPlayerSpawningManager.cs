// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System;
using System.Collections.Generic;
using UltimateGloveBall.Arena.Gameplay;
using UltimateGloveBall.Arena.Player;
using UltimateGloveBall.Arena.Spectator;
using Unity.Netcode;
using UnityEngine;
using Random = UnityEngine.Random;

namespace UltimateGloveBall.Arena.Services
{
    /// <summary>
    /// The Spawning Manager handles player connecting to an arena. It handles spawning players in the right teams and
    /// the right position. When a player requests to be spawned in the game, this controller will assess what player
    /// or spectator prefab to generate, their position, team and team color.
    /// </summary>
    public class ArenaPlayerSpawningManager : SpawningManagerBase
    {
        [SerializeField] private NetworkObject m_playerPrefab;
        [SerializeField] private NetworkObject m_gloveArmaturePrefab;
        [SerializeField] private NetworkObject m_gloveHandPrefab;

        [SerializeField] private NetworkObject m_spectatorPrefab;

        [SerializeField] private GameManager m_gameManager;

        [SerializeField] private Transform[] m_teamASpawnPoints = Array.Empty<Transform>();
        [SerializeField] private Transform[] m_teamBSpawnPoints = Array.Empty<Transform>();

        [SerializeField] private SpawnPointReservingService m_spectatorASpawnPoints;
        [SerializeField] private SpawnPointReservingService m_spectatorBSpawnPoints;

        [SerializeField] private SpawnPointReservingService m_winnerSpawnPoints;
        [SerializeField] private SpawnPointReservingService m_loserSpawnPoints;
        private bool m_tieAlternateToWin = true;

        // spawn point randomizer
        private Queue<int> m_teamARandomSpawnOrder = new();
        private Queue<int> m_teamBRandomSpawnOrder = new();

        private readonly List<int> m_tempListForSpawnPoints = new();

        protected override void Awake()
        {
            RandomizeSpawnPoints(m_teamASpawnPoints.Length, ref m_teamARandomSpawnOrder);
            RandomizeSpawnPoints(m_teamBSpawnPoints.Length, ref m_teamBRandomSpawnOrder);
            base.Awake();
        }

        private void RandomizeSpawnPoints(int length, ref Queue<int> randomQueue)
        {
            m_tempListForSpawnPoints.Clear();
            for (var i = 0; i < length; ++i)
            {
                m_tempListForSpawnPoints.Add(i);
            }

            var n = length;
            while (n > 1)
            {
                n--;
                var k = Random.Range(0, n);
                var value = m_tempListForSpawnPoints[k];
                m_tempListForSpawnPoints[k] = m_tempListForSpawnPoints[n];
                m_tempListForSpawnPoints[n] = value;
            }

            randomQueue.Clear();
            for (var i = 0; i < length; ++i)
            {
                randomQueue.Enqueue(m_tempListForSpawnPoints[i]);
            }

            m_tempListForSpawnPoints.Clear();
        }

        public override NetworkObject SpawnPlayer(ulong clientId, string playerId, bool isSpectator, Vector3 playerPos)
        {
            if (isSpectator)
            {
                var spectator = SpawnSpectator(clientId, playerId, playerPos);
                return spectator;
            }

            ArenaSessionManager.Instance.SetupPlayerData(clientId, playerId, new ArenaPlayerData(clientId, playerId));
            var playerData = ArenaSessionManager.Instance.GetPlayerData(playerId).Value;
            // setup data based on gamePhase
            GetSpawnData(ref playerData, playerPos, out var position, out var rotation, out var team,
                out var color, out var spawnTeam);

            var player = Instantiate(m_playerPrefab, position, rotation);
            player.SpawnAsPlayerObject(clientId);
            player.GetComponent<NetworkedTeam>().MyTeam = team;

            var leftArmatureNet = Instantiate(m_gloveArmaturePrefab, Vector3.down, Quaternion.identity);
            var leftArmature = leftArmatureNet.GetComponent<GloveArmatureNetworking>();
            leftArmature.Side = Glove.GloveSide.Left;
            leftArmatureNet.GetComponent<TeamColoringNetComponent>().TeamColor = color;
            var leftHandNet = Instantiate(m_gloveHandPrefab, Vector3.down, Quaternion.identity);
            var leftHand = leftHandNet.GetComponent<GloveNetworking>();
            leftHand.Side = Glove.GloveSide.Left;
            leftHandNet.GetComponent<TeamColoringNetComponent>().TeamColor = color;

            var rightArmatureNet = Instantiate(m_gloveArmaturePrefab, Vector3.down, Quaternion.identity);
            var rightArmature = rightArmatureNet.GetComponent<GloveArmatureNetworking>();
            rightArmature.Side = Glove.GloveSide.Right;
            rightArmatureNet.GetComponent<TeamColoringNetComponent>().TeamColor = color;
            var rightHandNet = Instantiate(m_gloveHandPrefab, Vector3.down, Quaternion.identity);
            var rightHand = rightHandNet.GetComponent<GloveNetworking>();
            rightHand.Side = Glove.GloveSide.Right;
            rightHandNet.GetComponent<TeamColoringNetComponent>().TeamColor = color;
            rightArmatureNet.SpawnWithOwnership(clientId);
            rightHandNet.SpawnWithOwnership(clientId);
            leftArmatureNet.SpawnWithOwnership(clientId);
            leftHandNet.SpawnWithOwnership(clientId);

            player.GetComponent<PlayerControllerNetwork>().ArmatureLeft = leftArmature;
            player.GetComponent<PlayerControllerNetwork>().ArmatureRight = rightArmature;
            player.GetComponent<PlayerControllerNetwork>().GloveLeft = leftHand;
            player.GetComponent<PlayerControllerNetwork>().GloveRight = rightHand;

            playerData.SelectedTeam = team;
            m_gameManager.UpdatePlayerTeam(clientId, spawnTeam);
            ArenaSessionManager.Instance.SetPlayerData(clientId, playerData);

            return player;
        }

        public void ResetPostGameSpawnPoints()
        {
            m_winnerSpawnPoints.Reset();
            m_loserSpawnPoints.Reset();
        }

        public void ResetInGameSpawnPoints()
        {
            RandomizeSpawnPoints(m_teamASpawnPoints.Length, ref m_teamARandomSpawnOrder);
            RandomizeSpawnPoints(m_teamBSpawnPoints.Length, ref m_teamBRandomSpawnOrder);
        }

        public override void GetRespawnPoint(ulong clientId, NetworkedTeam.Team team,
            out Vector3 position, out Quaternion rotation)
        {
            var playerData = ArenaSessionManager.Instance.GetPlayerData(clientId).Value;
            GetSpawnPositionForTeam(m_gameManager.CurrentPhase, team, ref playerData, out position, out rotation);
            ArenaSessionManager.Instance.SetPlayerData(clientId, playerData);
        }

        public Transform SwitchSpectatorSide(ulong clientId, SpectatorNetwork spectator)
        {
            var playerData = ArenaSessionManager.Instance.GetPlayerData(clientId).Value;
            if (!playerData.IsSpectator)
            {
                return null;
            }

            var spawnPoints = playerData.SelectedTeam == NetworkedTeam.Team.TeamA
                ? m_spectatorASpawnPoints
                : m_spectatorBSpawnPoints;
            spawnPoints.ReleaseSpawnPoint(playerData.SpawnPointIndex);

            // switch teams
            playerData.SelectedTeam = playerData.SelectedTeam == NetworkedTeam.Team.TeamA
                ? NetworkedTeam.Team.TeamB
                : NetworkedTeam.Team.TeamA;
            spectator.TeamSideColor = playerData.SelectedTeam == NetworkedTeam.Team.TeamA
                ? m_gameManager.TeamAColor
                : m_gameManager.TeamBColor;
            spawnPoints = playerData.SelectedTeam == NetworkedTeam.Team.TeamA
                ? m_spectatorASpawnPoints
                : m_spectatorBSpawnPoints;
            var newLocation = spawnPoints.ReserveRandomSpawnPoint(out var spawnIndex);
            playerData.SpawnPointIndex = spawnIndex;
            ArenaSessionManager.Instance.SetPlayerData(clientId, playerData);
            return newLocation;
        }

        protected override void OnClientDisconnected(ulong clientId)
        {
            var playerData = ArenaSessionManager.Instance.GetPlayerData(clientId);
            if (playerData.HasValue)
            {
                var data = playerData.Value;
                data.IsConnected = false;
                if (m_gameManager.CurrentPhase == GameManager.GamePhase.PostGame)
                {
                    if (data.SpawnPointIndex > 0)
                    {
                        if (data.PostGameWinnerSide)
                        {
                            m_winnerSpawnPoints.ReleaseSpawnPoint(data.SpawnPointIndex);
                        }
                        else
                        {
                            m_loserSpawnPoints.ReleaseSpawnPoint(data.SpawnPointIndex);
                        }
                    }
                }

                ArenaSessionManager.Instance.SetPlayerData(clientId, data);
            }
        }

        private NetworkObject SpawnSpectator(ulong clientId, string playerId, Vector3 playerPos)
        {
            ArenaSessionManager.Instance.SetupPlayerData(clientId, playerId,
                new ArenaPlayerData(clientId, playerId, true));
            var playerData = ArenaSessionManager.Instance.GetPlayerData(playerId).Value;
            Transform spawnPoint;
            if (playerData.SelectedTeam == NetworkedTeam.Team.NoTeam)
            {
                bool useA;
                var findClosestSpawnPoint = false;
                if (playerPos == Vector3.zero)
                {
                    useA = Random.Range(0, 2) == 0;
                }
                else
                {
                    useA = playerPos.z < 0;
                    findClosestSpawnPoint = true;
                }

                var spawnPoints = useA ? m_spectatorASpawnPoints : m_spectatorBSpawnPoints;
                spawnPoint = findClosestSpawnPoint
                    ? spawnPoints.ReserveClosestSpawnPoint(playerPos, out var spawnIndex)
                    : spawnPoints.ReserveRandomSpawnPoint(out spawnIndex);

                if (spawnPoint == null)
                {
                    useA = !useA;
                    spawnPoints = useA ? m_spectatorASpawnPoints : m_spectatorBSpawnPoints;
                    spawnPoint = spawnPoints.ReserveRandomSpawnPoint(out spawnIndex);
                }

                playerData.SelectedTeam = useA ? NetworkedTeam.Team.TeamA : NetworkedTeam.Team.TeamB;
                playerData.SpawnPointIndex = spawnIndex;
            }
            else
            {
                var spawnPoints = playerData.SelectedTeam == NetworkedTeam.Team.TeamA
                    ? m_spectatorASpawnPoints
                    : m_spectatorBSpawnPoints;
                if (playerData.SpawnPointIndex < 0)
                {
                    spawnPoint = spawnPoints.ReserveRandomSpawnPoint(out var spawnIndex);
                    playerData.SpawnPointIndex = spawnIndex;
                }
                else
                {
                    spawnPoint = spawnPoints.GetSpawnPoint(playerData.SpawnPointIndex, true);
                }
            }

            var position = spawnPoint.position;
            var rotation = spawnPoint.rotation;
            var spectator = Instantiate(m_spectatorPrefab, position, rotation);
            spectator.GetComponent<SpectatorNetwork>().TeamSideColor =
                playerData.SelectedTeam == NetworkedTeam.Team.TeamA
                    ? m_gameManager.TeamAColor
                    : m_gameManager.TeamBColor;
            spectator.SpawnAsPlayerObject(clientId);
            ArenaSessionManager.Instance.SetPlayerData(clientId, playerData);
            return spectator;
        }

        private void GetSpawnData(ref ArenaPlayerData playerData, Vector3 currentPos, out Vector3 position,
            out Quaternion rotation, out NetworkedTeam.Team team, out TeamColor teamColor,
            out NetworkedTeam.Team spawnTeam)
        {
            var currentPhase = m_gameManager.CurrentPhase;
            team = currentPhase switch
            {
                GameManager.GamePhase.InGame or GameManager.GamePhase.CountDown => GetTeam(playerData, currentPos),
                GameManager.GamePhase.PostGame => GetTeam(playerData, currentPos),
                GameManager.GamePhase.PreGame => NetworkedTeam.Team.NoTeam,
                _ => NetworkedTeam.Team.NoTeam,
            };
            spawnTeam = team;
            if (spawnTeam == NetworkedTeam.Team.NoTeam)
            {
                spawnTeam = GetTeam(playerData, currentPos);
            }

            GetSpawnPositionForTeam(currentPhase, spawnTeam, ref playerData, out position, out rotation);

            teamColor = GetTeamColor(spawnTeam);
        }

        private NetworkedTeam.Team GetTeam(ArenaPlayerData playerData, Vector3 currentPos)
        {
            if (playerData.SelectedTeam != NetworkedTeam.Team.NoTeam)
            {
                return playerData.SelectedTeam;
            }

            NetworkedTeam.Team team;
            if (currentPos == Vector3.zero)
            {
                team = m_gameManager.GetTeamWithLeastPlayers();
            }
            else
            {
                if (m_gameManager.CurrentPhase == GameManager.GamePhase.PostGame)
                {
                    var winningTeam = GameState.Instance.Score.GetWinningTeam();
                    if (winningTeam == NetworkedTeam.Team.NoTeam)
                    {
                        winningTeam = NetworkedTeam.Team.TeamA;
                    }

                    var losingTeam = winningTeam == NetworkedTeam.Team.TeamA
                        ? NetworkedTeam.Team.TeamB
                        : NetworkedTeam.Team.TeamA;
                    team = Mathf.Abs(currentPos.z - m_winnerSpawnPoints.transform.position.z) >=
                           Mathf.Abs(currentPos.z - m_loserSpawnPoints.transform.position.z)
                        ? winningTeam
                        : losingTeam;
                }
                else
                {
                    team = currentPos.z < 0 ? NetworkedTeam.Team.TeamA : NetworkedTeam.Team.TeamB;
                }
            }

            return team;
        }

        private void GetSpawnPositionForTeam(GameManager.GamePhase gamePhase, NetworkedTeam.Team team,
            ref ArenaPlayerData playerData,
            out Vector3 position, out Quaternion rotation)
        {
            if (gamePhase == GameManager.GamePhase.PostGame)
            {
                var winningTeam = GameState.Instance.Score.GetWinningTeam();
                var useWin = winningTeam == team;
                if (winningTeam == NetworkedTeam.Team.NoTeam)
                {
                    useWin = m_tieAlternateToWin;
                    m_tieAlternateToWin = !m_tieAlternateToWin;
                }

                Transform trans = null;
                if (useWin)
                {
                    trans = m_winnerSpawnPoints.ReserveRandomSpawnPoint(out var index);
                    playerData.PostGameWinnerSide = true;
                    playerData.SpawnPointIndex = index;
                }

                if (trans == null)
                {
                    trans = m_loserSpawnPoints.ReserveRandomSpawnPoint(out var index);
                    playerData.PostGameWinnerSide = false;
                    playerData.SpawnPointIndex = index;
                }

                position = trans.position;
                rotation = trans.rotation;

                return;
            }

            if (team == NetworkedTeam.Team.TeamA)
            {
                if (m_teamARandomSpawnOrder.Count <= 0)
                {
                    RandomizeSpawnPoints(m_teamASpawnPoints.Length, ref m_teamARandomSpawnOrder);
                }

                var point = m_teamASpawnPoints[m_teamARandomSpawnOrder.Dequeue()];
                position = point.position;
                rotation = point.rotation;
            }
            else
            {
                if (m_teamBRandomSpawnOrder.Count <= 0)
                {
                    RandomizeSpawnPoints(m_teamBSpawnPoints.Length, ref m_teamBRandomSpawnOrder);
                }

                var point = m_teamBSpawnPoints[m_teamBRandomSpawnOrder.Dequeue()];
                position = point.position;
                rotation = point.rotation;
            }
        }

        private TeamColor GetTeamColor(NetworkedTeam.Team team)
        {
            var useTeamA = team == NetworkedTeam.Team.TeamA;
            var color = useTeamA ? m_gameManager.TeamAColor : m_gameManager.TeamBColor;
            return color;
        }
    }
}
