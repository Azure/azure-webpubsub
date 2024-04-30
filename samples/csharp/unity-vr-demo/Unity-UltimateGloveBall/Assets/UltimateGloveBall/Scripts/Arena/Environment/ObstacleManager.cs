// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System.Collections.Generic;
using UltimateGloveBall.Arena.Services;
using UnityEngine;

namespace UltimateGloveBall.Arena.Environment
{
    /// <summary>
    /// This manager will keep a list of the obstacles to easily be able to color them the appropriate team color.
    /// </summary>
    public class ObstacleManager : MonoBehaviour
    {
        [SerializeField] private List<Obstacle> m_teamAObstacles;
        [SerializeField] private List<Obstacle> m_teamBObstacles;

        public void SetTeamColor(TeamColor teamA, TeamColor teamB)
        {
            foreach (var obstacle in m_teamAObstacles)
            {
                obstacle.UpdateColor(teamA);
            }

            foreach (var obstacle in m_teamBObstacles)
            {
                obstacle.UpdateColor(teamB);
            }
        }
    }
}