// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System;
using System.Collections;
using System.Collections.Generic;
using UltimateGloveBall.App;
using UltimateGloveBall.Arena.Balls;
using UltimateGloveBall.Arena.Environment;
using UltimateGloveBall.Arena.Player;
using UltimateGloveBall.Arena.Services;
using Unity.Netcode;
using UnityEngine;
#if !(UNITY_EDITOR || UNITY_STANDALONE_WIN)
using Oculus.Platform;
#endif

namespace UltimateGloveBall.Arena.Gameplay
{
    /// <summary>
    /// Manages the state of the game. This handles the different phases of the game (Pre-game, Countdown, Game and
    /// Post-Game). It handles keeping track of what teams players are on during the pregame phase, seting up
    /// the scene according to the pahse and randomly selecting a color profile for the game.
    /// </summary>
    public class GameManager : NetworkBehaviour
    {
        private const double GAME_START_COUNTDOWN_TIME_SEC = 4;
        private const double GAME_DURATION_SEC = 180;
        public enum GamePhase
        {
            PreGame,
            CountDown,
            InGame,
            PostGame,
        }

        private struct GameStateSave
        {
            public double TimeRemaining;
        }

        [SerializeField] private GameState m_gameState;
        [SerializeField] private GameObject m_startGameButtonContainer;
        [SerializeField] private GameObject m_restartGameButtonContainer;
        [SerializeField] private GameObject m_inviteFriendButtonContainer;
        [SerializeField] private BallSpawner m_ballSpawner;

        [SerializeField] private CountdownView m_countdownView;

        [SerializeField] private ObstacleManager m_obstacleManager;

        [SerializeField] private GameObject m_postGameView;

        [SerializeField] private AudioSource m_courtAudioSource;
        [SerializeField] private AudioClip m_lowCountdownBeep;
        [SerializeField] private AudioClip m_highCountdownBeep;

        private readonly List<IGamePhaseListener> m_phaseListeners = new();

        private NetworkVariable<GamePhase> m_currentGamePhase = new(GamePhase.PreGame);
        private NetworkVariable<double> m_gameStartTime = new();

        private NetworkVariable<double> m_gameEndTime = new();

        private readonly Dictionary<ulong, NetworkedTeam.Team> m_playersTeamSelection = new();

        private NetworkVariable<TeamColor> m_teamAColor = new(TeamColor.Profile1TeamA);
        private NetworkVariable<TeamColor> m_teamBColor = new(TeamColor.Profile1TeamB);
        private bool m_teamColorIsSet = false;

        private GameStateSave m_gameStateSave;

        private int m_previousSecondsLeft = int.MaxValue;

        public GamePhase CurrentPhase => m_currentGamePhase.Value;
        public TeamColor TeamAColor => m_teamAColor.Value;
        public TeamColor TeamBColor => m_teamBColor.Value;

        private void OnEnable()
        {
            m_currentGamePhase.OnValueChanged += OnPhaseChanged;
            m_gameStartTime.OnValueChanged += OnStartTimeChanged;
            UGBApplication.Instance.NetworkLayer.OnHostLeftAndStartingMigration += OnHostMigrationStarted;
        }

        private void OnStartTimeChanged(double previousvalue, double newvalue)
        {
            if (m_currentGamePhase.Value == GamePhase.CountDown)
            {
                Debug.LogWarning($"OnStartTimeChanged: {newvalue}");
                m_countdownView.Show(newvalue);
            }
        }

        private void OnHostMigrationStarted()
        {
            if (m_currentGamePhase.Value == GamePhase.InGame)
            {
                m_gameStateSave.TimeRemaining = m_gameEndTime.Value - NetworkManager.Singleton.ServerTime.Time;
            }
        }

        private void OnDisable()
        {
            m_currentGamePhase.OnValueChanged -= OnPhaseChanged;
            m_gameStartTime.OnValueChanged -= OnStartTimeChanged;
            UGBApplication.Instance.NetworkLayer.OnHostLeftAndStartingMigration -= OnHostMigrationStarted;
        }

        public void RegisterPhaseListener(IGamePhaseListener listener)
        {
            m_phaseListeners.Add(listener);
            listener.OnPhaseChanged(m_currentGamePhase.Value);
            listener.OnTeamColorUpdated(TeamAColor, TeamBColor);
        }

        public void UnregisterPhaseListener(IGamePhaseListener listener)
        {
            _ = m_phaseListeners.Remove(listener);
        }

        public void UpdatePlayerTeam(ulong clientId, NetworkedTeam.Team team)
        {
            m_playersTeamSelection[clientId] = team;
        }

        public NetworkedTeam.Team GetTeamWithLeastPlayers()
        {
            var countA = 0;
            var countB = 0;
            foreach (var team in m_playersTeamSelection.Values)
            {
                if (team == NetworkedTeam.Team.TeamA)
                {
                    countA++;
                }
                else if (team == NetworkedTeam.Team.TeamB)
                {
                    countB++;
                }
            }

            return countA <= countB ? NetworkedTeam.Team.TeamA : NetworkedTeam.Team.TeamB;
        }

        public override void OnNetworkSpawn()
        {
            var currentPhase = m_currentGamePhase.Value;
            if (IsServer)
            {
                if (!m_teamColorIsSet)
                {
                    TeamColorProfiles.Instance.GetRandomProfile(out var colorA, out var colorB);
                    m_teamAColor.Value = colorA;
                    m_teamBColor.Value = colorB;
                    m_teamColorIsSet = true;
                }
                OnColorUpdatedClientRPC(m_teamAColor.Value, m_teamBColor.Value);

                if (m_currentGamePhase.Value is GamePhase.PreGame)
                {
                    m_startGameButtonContainer.SetActive(true);
                }
                else if (m_currentGamePhase.Value is GamePhase.PostGame)
                {
                    m_restartGameButtonContainer.SetActive(true);
                }

                m_obstacleManager.SetTeamColor(TeamAColor, TeamBColor);

                // If we comeback from a host migration we need to handle the different states
                if (currentPhase == GamePhase.CountDown)
                {
                    StartCountdown();
                }
                else if (currentPhase == GamePhase.InGame)
                {
                    HandleInGameHostMigration(m_gameStateSave.TimeRemaining);
                }
            }

            if (m_currentGamePhase.Value == GamePhase.PreGame)
            {
                m_inviteFriendButtonContainer.SetActive(true);
            }

            OnPhaseChanged(currentPhase, currentPhase);
            NotifyPhaseListener(m_currentGamePhase.Value);
            m_teamColorIsSet = true;
        }

        private void OnPhaseChanged(GamePhase previousvalue, GamePhase newvalue)
        {
            if (newvalue == GamePhase.CountDown)
            {
                m_countdownView.Show(m_gameStartTime.Value);
            }

            if (newvalue == GamePhase.PostGame)
            {
                m_postGameView.SetActive(true);
            }
            else
            {
                m_postGameView.SetActive(false);
            }

            var playerCanMove = newvalue is GamePhase.InGame or GamePhase.PreGame;
            PlayerInputController.Instance.MovementEnabled = playerCanMove;
            // only applies for in game players
            if (LocalPlayerEntities.Instance.Avatar != null)
            {
                m_inviteFriendButtonContainer.SetActive(newvalue == GamePhase.PreGame);
            }
            m_previousSecondsLeft = int.MaxValue;
            NotifyPhaseListener(newvalue);
        }

        public void StartGame()
        {
            if (m_currentGamePhase.Value is GamePhase.PreGame or GamePhase.PostGame)
            {
                m_gameState.Score.Reset();
                _ = StartCoroutine(DeactivateStartButton());

                // only check side on initial start of game
                if (m_currentGamePhase.Value is GamePhase.PreGame)
                {
                    CheckPlayersSides();
                    LockPlayersTeams();
                }

                StartCountdown();
                ((ArenaPlayerSpawningManager)SpawningManagerBase.Instance).ResetInGameSpawnPoints();
                RespawnAllPlayers();
            }
        }

        [ClientRpc]
        private void OnColorUpdatedClientRPC(TeamColor teamColorA, TeamColor teamColorB)
        {
            NotifyTeamColorListener(teamColorA, teamColorB);
            m_teamColorIsSet = true;
        }

        public void InviteFriend()
        {
            // don't open invite panel if in another phase than pregame
            if (CurrentPhase != GamePhase.PreGame)
            {
                return;
            }
#if UNITY_EDITOR || UNITY_STANDALONE_WIN
            Debug.Log("Invite Friends clicked");
#else
            GroupPresence.LaunchInvitePanel(new InviteOptions());
#endif
        }

        private IEnumerator DeactivateStartButton()
        {
            // We need to finish processing the pointers before deactivating UI
            yield return new WaitForEndOfFrame();
            m_startGameButtonContainer.SetActive(false);
            m_restartGameButtonContainer.SetActive(false);
        }

        private void StartCountdown()
        {
            m_gameStartTime.Value = NetworkManager.Singleton.ServerTime.Time + GAME_START_COUNTDOWN_TIME_SEC;
            m_currentGamePhase.Value = GamePhase.CountDown;
            m_countdownView.Show(m_gameStartTime.Value, SwitchToInGame);
        }

        public void SwitchToInGame()
        {
            m_currentGamePhase.Value = GamePhase.InGame;
            m_gameEndTime.Value = NetworkManager.Singleton.ServerTime.Time + GAME_DURATION_SEC;
            m_ballSpawner.SpawnInitialBalls();
        }

        private void GoToPostGame()
        {
            m_ballSpawner.DeSpawnAllBalls();
            m_currentGamePhase.Value = GamePhase.PostGame;
            m_restartGameButtonContainer.SetActive(true);
            ((ArenaPlayerSpawningManager)SpawningManagerBase.Instance).ResetPostGameSpawnPoints();
            RespawnAllPlayers();
        }

        private void Update()
        {
            if (m_currentGamePhase.Value == GamePhase.InGame)
            {
                var timeLeft = m_gameEndTime.Value - NetworkManager.Singleton.ServerTime.Time;
                UpdateTimeInPhaseListener(Math.Max(0, timeLeft));

                if (timeLeft < 11)
                {
                    var seconds = Math.Max(0, (int)Math.Floor(timeLeft));
                    if (m_previousSecondsLeft != seconds)
                    {
                        TriggerEndGameCountdownBeep(seconds);
                    }

                    m_previousSecondsLeft = seconds;

                    if (IsServer)
                    {
                        if (timeLeft < 0)
                        {
                            GoToPostGame();
                        }
                    }
                }
            }
            else if (m_currentGamePhase.Value == GamePhase.PreGame)
            {
                if (NetworkManager.Singleton.IsListening && NetworkManager.Singleton.IsServer)
                {
                    CheckPlayersSides();
                }
            }
        }

        private void TriggerEndGameCountdownBeep(int seconds)
        {
            if (seconds == 0)
            {
                m_courtAudioSource.PlayOneShot(m_highCountdownBeep);
            }
            else
            {
                m_courtAudioSource.PlayOneShot(m_lowCountdownBeep);
            }
        }

        private void OnGUI()
        {
            if (IsServer)
            {
                if (m_currentGamePhase.Value is GamePhase.PreGame or GamePhase.PostGame)
                {
                    if (GUILayout.Button("StartGame"))
                    {
                        StartGame();
                    }
                }
            }
        }

        private void NotifyPhaseListener(GamePhase newphase)
        {
            foreach (var listener in m_phaseListeners)
            {
                listener.OnPhaseChanged(newphase);
            }
        }
        private void UpdateTimeInPhaseListener(double timeLeft)
        {
            foreach (var listener in m_phaseListeners)
            {
                listener.OnPhaseTimeUpdate(timeLeft);
            }
        }

        private void NotifyTeamColorListener(TeamColor teamColorA, TeamColor teamColorB)
        {
            foreach (var listener in m_phaseListeners)
            {
                listener.OnTeamColorUpdated(teamColorA, teamColorB);
            }
        }

        private void LockPlayersTeams()
        {
            foreach (var clientId in NetworkManager.Singleton.ConnectedClientsIds)
            {
                if (m_playersTeamSelection.TryGetValue(clientId, out var team))
                {
                    var avatar = LocalPlayerEntities.Instance.GetPlayerObjects(clientId).Avatar;
                    if (avatar != null)
                    {
                        avatar.GetComponent<NetworkedTeam>().MyTeam = team;

                        var playerData = ArenaSessionManager.Instance.GetPlayerData(clientId).Value;
                        playerData.SelectedTeam = team;
                        ArenaSessionManager.Instance.SetPlayerData(clientId, playerData);
                    }
                }
            }
        }

        private void CheckPlayersSides()
        {
            var clientCount = NetworkManager.Singleton.ConnectedClientsIds.Count;
            if (m_playersTeamSelection.Count != clientCount)
            {
                m_playersTeamSelection.Clear();
            }

            for (var i = 0; i < clientCount; ++i)
            {
                var clientId = NetworkManager.Singleton.ConnectedClientsIds[i];
                var playerObjects = LocalPlayerEntities.Instance.GetPlayerObjects(clientId);
                var avatar = playerObjects.Avatar;
                if (avatar != null)
                {
                    var side = avatar.transform.position.z < 0
                        ? NetworkedTeam.Team.TeamA
                        : NetworkedTeam.Team.TeamB;

                    var color = side == NetworkedTeam.Team.TeamA ? TeamAColor : TeamBColor;

                    foreach (var colorComp in playerObjects.ColoringComponents)
                    {
                        colorComp.TeamColor = color;
                    }

                    m_playersTeamSelection[clientId] = side;
                }
            }
        }

        private void RespawnAllPlayers()
        {
            foreach (var clientId in LocalPlayerEntities.Instance.PlayerIds)
            {
                var allPlayerObjects = LocalPlayerEntities.Instance.GetPlayerObjects(clientId);
                if (allPlayerObjects.Avatar)
                {
                    SpawningManagerBase.Instance.GetRespawnPoint(
                        clientId,
                        allPlayerObjects.Avatar.GetComponent<NetworkedTeam>().MyTeam, out var position,
                        out var rotation);
                    // only send to specific client
                    var clientRpcParams = new ClientRpcParams
                    {
                        Send = new ClientRpcSendParams { TargetClientIds = new ulong[] { clientId } }
                    };
                    OnRespawnClientRpc(position, rotation, m_currentGamePhase.Value, clientRpcParams);
                }
            }
        }

        private void HandleInGameHostMigration(double timeRemaining)
        {
            m_currentGamePhase.Value = GamePhase.InGame;
            m_gameEndTime.Value = NetworkManager.Singleton.ServerTime.Time + timeRemaining;
            m_ballSpawner.SpawnInitialBalls();
        }

        [ClientRpc]
        private void OnRespawnClientRpc(Vector3 position, Quaternion rotation, GamePhase phase, ClientRpcParams rpcParams)
        {
            if (phase is GamePhase.PostGame or GamePhase.CountDown)
            {
                PlayerInputController.Instance.MovementEnabled = false;
            }
            PlayerMovement.Instance.TeleportTo(position, rotation);
            LocalPlayerEntities.Instance.LeftGloveHand.ResetGlove();
            LocalPlayerEntities.Instance.RightGloveHand.ResetGlove();
        }
    }
}