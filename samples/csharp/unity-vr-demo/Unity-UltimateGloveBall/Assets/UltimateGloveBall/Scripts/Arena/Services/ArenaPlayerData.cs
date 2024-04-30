// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using UltimateGloveBall.Arena.Gameplay;

namespace UltimateGloveBall.Arena.Services
{
    /// <summary>
    /// This is a container of data for players connecting to the arena. It's a state of connection of a player that can
    /// be used when a player tries to reconnect to the same arena.
    /// </summary>
    public struct ArenaPlayerData
    {
        public ulong ClientId;
        public string PlayerId;
        public NetworkedTeam.Team SelectedTeam;
        public bool IsConnected;
        public bool IsSpectator;
        public int SpawnPointIndex;

        public bool PostGameWinnerSide;

        public ArenaPlayerData(ulong clientId, string playerId, bool isSpectator = false)
        {
            ClientId = clientId;
            PlayerId = playerId;
            SelectedTeam = NetworkedTeam.Team.NoTeam;
            IsConnected = true;
            IsSpectator = isSpectator;
            SpawnPointIndex = -1;
            PostGameWinnerSide = false;
        }
    }
}