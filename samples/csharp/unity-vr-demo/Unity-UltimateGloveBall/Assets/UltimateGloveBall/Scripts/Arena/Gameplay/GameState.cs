// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using Meta.Utilities;
using UnityEngine;

namespace UltimateGloveBall.Arena.Gameplay
{
    /// <summary>
    /// Keeps track of specific game state.
    /// </summary>
    public class GameState : Singleton<GameState>
    {
        [SerializeField, AutoSet] public NetworkedScore Score;
    }
}