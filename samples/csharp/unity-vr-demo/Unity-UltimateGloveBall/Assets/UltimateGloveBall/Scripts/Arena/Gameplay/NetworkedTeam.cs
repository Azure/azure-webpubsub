// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using UltimateGloveBall.Arena.Player;
using Unity.Netcode;

namespace UltimateGloveBall.Arena.Gameplay
{
    /// <summary>
    /// Component that keeps the team information of a network object in sync between clients.
    /// When the team changes we also update the movement limits of the local player.
    /// </summary>
    public class NetworkedTeam : NetworkBehaviour
    {
        public enum Team
        {
            NoTeam,
            TeamA,
            TeamB,
        }

        private NetworkVariable<Team> m_team = new();

        public Team MyTeam { get => m_team.Value; set => m_team.Value = value; }

        public override void OnNetworkSpawn()
        {
            if (IsOwner)
            {
                m_team.OnValueChanged += OnTeamChanged;
                OnTeamChanged(m_team.Value, m_team.Value);
            }
        }

        public override void OnNetworkDespawn()
        {
            if (IsOwner)
            {
                m_team.OnValueChanged -= OnTeamChanged;
            }
        }

        private void OnTeamChanged(Team previousvalue, Team newvalue)
        {
            // Update movement limits when we switch teams on local player
            if (newvalue == Team.TeamA)
            {
                PlayerMovement.Instance.SetLimits(-4.5f, 4.5f, -9, -1);
            }
            else if (newvalue == Team.TeamB)
            {
                PlayerMovement.Instance.SetLimits(-4.5f, 4.5f, 1, 9);
            }
            else
            {
                PlayerMovement.Instance.SetLimits(-4.5f, 4.5f, -9, 9);
            }
        }
    }
}