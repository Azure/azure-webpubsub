// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using UltimateGloveBall.Arena.Services;

namespace UltimateGloveBall.Arena.Gameplay
{
    /// <summary>
    /// Interface for game phase listener that can be registered to the game manager.
    /// </summary>
    public interface IGamePhaseListener
    {
        void OnPhaseChanged(GameManager.GamePhase phase);
        void OnPhaseTimeUpdate(double timeLeft);
        void OnTeamColorUpdated(TeamColor teamColorA, TeamColor teamColorB);
    }
}