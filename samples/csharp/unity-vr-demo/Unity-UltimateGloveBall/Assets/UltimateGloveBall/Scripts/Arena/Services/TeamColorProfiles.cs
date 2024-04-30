// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System;
using System.Collections.Generic;
using Meta.Utilities;
using UnityEngine;
using Random = UnityEngine.Random;

namespace UltimateGloveBall.Arena.Services
{
    /// <summary>
    /// Setup of the different colors for all the profiles. Each profiled is paired for team A and B.
    /// This helps simplify getting a random profile for the teams color and synchronize the colors for all clients. 
    /// </summary>
    public class TeamColorProfiles : Singleton<TeamColorProfiles>
    {
        [Serializable]
        private struct ColorProfile
        {
            public TeamColor ColorKey;
            public Color Color;
        }

        [SerializeField] private List<ColorProfile> m_colorProfiles;

        private readonly Dictionary<TeamColor, Color> m_colors = new();
        protected override void InternalAwake()
        {
            foreach (var colorProfile in m_colorProfiles)
            {
                m_colors[colorProfile.ColorKey] = colorProfile.Color;
            }
        }

        public Color GetColorForKey(TeamColor teamColor)
        {
            return m_colors[teamColor];
        }

        public void GetRandomProfile(out TeamColor teamColorA, out TeamColor teamColorB)
        {
            var profileCount = (int)TeamColor.Count / 2;
            var selectedProfile = Random.Range(0, profileCount);
            teamColorA = (TeamColor)(selectedProfile * 2);
            teamColorB = teamColorA + 1;
        }
    }
}