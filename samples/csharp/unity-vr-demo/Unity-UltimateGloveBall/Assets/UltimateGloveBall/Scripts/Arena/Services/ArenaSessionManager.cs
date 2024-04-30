// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System.Collections.Generic;
using Meta.Utilities;
using UnityEngine;

namespace UltimateGloveBall.Arena.Services
{
    /// <summary>
    /// Manages the current Arena session, it keeps track of the player data for each client that connects.
    /// By keeping the information of each player the ArenaSpawningManager can keep track of players that reconnects.
    /// </summary>
    public class ArenaSessionManager : Singleton<ArenaSessionManager>
    {
        private readonly Dictionary<string, ArenaPlayerData> m_playerDataDict;
        private readonly Dictionary<ulong, string> m_clientIdToPlayerId;

        public ArenaSessionManager()
        {
            m_playerDataDict = new Dictionary<string, ArenaPlayerData>();
            m_clientIdToPlayerId = new Dictionary<ulong, string>();
        }

        public void SetupPlayerData(ulong clientId, string playerId, ArenaPlayerData playerData)
        {
            var isReconnecting = false;
            if (IsDuplicateConnection(playerId))
            {
                Debug.LogError($"Player Already in game: {playerId}");
                // player already connected
                return;
            }

            // Check for reconnecting player
            if (m_playerDataDict.ContainsKey(playerId))
            {
                if (!m_playerDataDict[playerId].IsConnected)
                {
                    // If this connecting client has the same player Id as a disconnected client, this is a reconnection.
                    isReconnecting = true;
                }
            }

            if (isReconnecting)
            {
                playerData = m_playerDataDict[playerId];
                playerData.ClientId = clientId;
                playerData.IsConnected = true;
            }

            // Update dictionaries
            m_clientIdToPlayerId[clientId] = playerId;
            m_playerDataDict[playerId] = playerData;
        }

        public bool IsDuplicateConnection(string playerId)
        {
            return m_playerDataDict.ContainsKey(playerId) && m_playerDataDict[playerId].IsConnected;
        }

        public string GetPlayerId(ulong clientId)
        {
            if (m_clientIdToPlayerId.TryGetValue(clientId, out var playerId))
            {
                return playerId;
            }

            Debug.Log($"No player Id mapped to client id: {clientId}");
            return null;
        }

        public ArenaPlayerData? GetPlayerData(string playerId)
        {
            if (m_playerDataDict.TryGetValue(playerId, out var data))
            {
                return data;
            }

            Debug.Log($"No PlayerData found for player ID: {playerId}");
            return null;
        }

        public ArenaPlayerData? GetPlayerData(ulong clientId)
        {
            var playerId = GetPlayerId(clientId);
            if (playerId != null)
            {
                return GetPlayerData(playerId);
            }

            Debug.LogError($"No player Id found for client ID: {clientId}");
            return null;
        }

        public void SetPlayerData(ulong clientId, ArenaPlayerData playerData)
        {
            if (m_clientIdToPlayerId.TryGetValue(clientId, out var playerId))
            {
                m_playerDataDict[playerId] = playerData;
            }
            else
            {
                Debug.LogError($"No player Id found for client ID: {clientId}");
            }
        }

        public void DisconnectClient(ulong clientId)
        {
            if (m_clientIdToPlayerId.TryGetValue(clientId, out var playerId))
            {
                if (GetPlayerData(playerId)?.ClientId == clientId)
                {
                    var clientData = m_playerDataDict[playerId];
                    clientData.IsConnected = false;
                    m_playerDataDict[playerId] = clientData;
                }
            }
        }
    }
}