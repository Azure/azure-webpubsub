// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System.Collections.Generic;
using UltimateGloveBall.Arena.Services;
using Unity.Netcode;
using UnityEngine;

namespace UltimateGloveBall.Arena.Gameplay
{
    /// <summary>
    /// Sync team color for colored renderers to all clients. This component will color all renderers listed with the
    /// associated TeamColor.
    /// </summary>
    public class TeamColoringNetComponent : NetworkBehaviour
    {
        private static readonly int s_colorProperty = Shader.PropertyToID("_BaseColor");

        [SerializeField] private List<Renderer> m_renderers;

        private NetworkVariable<TeamColor> m_teamColor = new();

        public TeamColor TeamColor
        {
            get => m_teamColor.Value;
            set => m_teamColor.Value = value;
        }

        public override void OnNetworkSpawn()
        {
            UpdateColor(TeamColor);
            m_teamColor.OnValueChanged += OnTeamColorChanged;
        }

        private void OnTeamColorChanged(TeamColor previousvalue, TeamColor newvalue)
        {
            UpdateColor(newvalue);
        }

        private void UpdateColor(TeamColor color)
        {
            foreach (var rend in m_renderers)
            {
                rend.material.SetColor(s_colorProperty,
                    TeamColorProfiles.Instance.GetColorForKey(color));
            }
        }
    }
}