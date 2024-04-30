// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System;
using Unity.Netcode;

namespace UltimateGloveBall.Arena.Gameplay
{
    /// <summary>
    /// Game score is networked to be kept in sync between all the clients.
    /// Register to the OnScoreUpdated to get an update when the score changes.
    /// </summary>
    public class NetworkedScore : NetworkBehaviour
    {
        private NetworkVariable<int> m_teamAScore = new();
        private NetworkVariable<int> m_teamBScore = new();
        public Action<int, int> OnScoreUpdated;

        public NetworkedTeam.Team GetWinningTeam()
        {
            if (m_teamAScore.Value > m_teamBScore.Value)
            {
                return NetworkedTeam.Team.TeamA;
            }
            else if (m_teamAScore.Value < m_teamBScore.Value)
            {
                return NetworkedTeam.Team.TeamB;
            }

            return NetworkedTeam.Team.NoTeam;
        }

        public override void OnNetworkSpawn()
        {
            if (!IsServer)
            {
                m_teamAScore.OnValueChanged += OnScoreChanged;
                m_teamBScore.OnValueChanged += OnScoreChanged;
            }
        }

        private void OnScoreChanged(int previousvalue, int newvalue)
        {
            OnScoreUpdated?.Invoke(m_teamAScore.Value, m_teamBScore.Value);
        }

        public void UpdateScore(NetworkedTeam.Team team, int inc)
        {
            switch (team)
            {
                case NetworkedTeam.Team.TeamA:
                    m_teamAScore.Value += inc;
                    break;
                case NetworkedTeam.Team.TeamB:
                    m_teamBScore.Value += inc;
                    break;
                case NetworkedTeam.Team.NoTeam:
                    break;
                default:
                    break;
            }

            OnScoreUpdated?.Invoke(m_teamAScore.Value, m_teamBScore.Value);
        }

        public void Reset()
        {
            m_teamAScore.Value = 0;
            m_teamBScore.Value = 0;
            OnScoreUpdated?.Invoke(m_teamAScore.Value, m_teamBScore.Value);
        }
    }
}