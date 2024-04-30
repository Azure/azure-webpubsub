// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System;
using System.Collections;
using System.Collections.Generic;
using Meta.Multiplayer.Core;
using UltimateGloveBall.App;
using Unity.Collections;
using Unity.Netcode;
using UnityEngine;

namespace UltimateGloveBall.Arena.Services
{
    /// <summary>
    /// Implements the approval checks for Netcode for game objects. It evaluates if a player can connect to the arena
    /// or if there's constraint that would prevent them from joining the arena like maximum player is reached or
    /// maximum spectators is reached. This is an additional check as Photon only has a check for total number of
    /// users in a room. if a player is rejected we send a message to the NetworkLayer of the reason for rejection.
    /// </summary>
    public class ArenaApprovalController : MonoBehaviour
    {
        [Serializable]
        public class ConnectionPayload
        {
            public bool IsPlayer;
        }

        public enum ConnectionStatus
        {
            Undefined = 0,
            Success,
            PlayerFull,
            SpectatorFull,
        }

        // This is used in ApprovalCheck as a light protection for DDOS attack and large payload of garbage data
        private const int MAX_CONNECT_PAYLOAD = 1024;

        private const int MAX_PLAYER_COUNT = 6;
        private const int MAX_SPECTATOR_COUNT = 4;


        [SerializeField] private NetworkManager m_networkManager;

        private readonly HashSet<ulong> m_playersClientIds = new();
        private readonly HashSet<ulong> m_spectatorClientIds = new();

        private bool m_playersSetFull;
        private bool m_spectatorsSetFull;

        private void Start()
        {
            DontDestroyOnLoad(gameObject);
            m_networkManager.ConnectionApprovalCallback += ApprovalCheck;
        }

        private void OnDestroy()
        {
            if (m_networkManager != null)
            {
                m_networkManager.ConnectionApprovalCallback -= ApprovalCheck;
            }
        }

        private void ApprovalCheck(NetworkManager.ConnectionApprovalRequest request,
            NetworkManager.ConnectionApprovalResponse response)
        {
            var connectionData = request.Payload;
            var clientId = request.ClientNetworkId;
            if (connectionData.Length > MAX_CONNECT_PAYLOAD)
            {
                // If the payload of the data is too high, we deny the request immediately as this is garbage data.
                // It will prevent the server from wasting time. Light protection from big buffer DDOS
                response.Approved = false;
                return;
            }

            // This happens is when the Host connects, we need to approve it
            if (clientId == NetworkManager.Singleton.LocalClientId)
            {
                Debug.Log("HOST CONNECTED APPROVED");
                m_playersClientIds.Clear();
                m_spectatorClientIds.Clear();
                _ = m_playersClientIds.Add(clientId);
                // Register on client disconnected when host connects
                m_networkManager.OnClientDisconnectCallback += OnClientDisconnected;
                response.Approved = true;
                return;
            }

            var payload = System.Text.Encoding.UTF8.GetString(connectionData);
            var connectionPayload = JsonUtility.FromJson<ConnectionPayload>(payload);
            var connectionStatus = CanClientConnect(connectionPayload);

            if (connectionStatus == ConnectionStatus.Success)
            {
                if (connectionPayload.IsPlayer)
                {
                    Debug.Log($"{clientId} - PLAYER CONNECTED APPROVED");
                    _ = m_playersClientIds.Add(clientId);
                    if (m_playersClientIds.Count >= MAX_PLAYER_COUNT)
                    {
                        var props = new ExitGames.Client.Photon.Hashtable()
                        {
                            {PhotonConnectionHandler.PLAYER_SLOT_OPEN, 0}
                        };
                        UGBApplication.Instance.NetworkLayer.SetRoomProperty(props);
                        m_playersSetFull = true;
                    }
                }
                else
                {
                    Debug.Log($"{clientId} - SPECTATOR CONNECTED APPROVED");
                    _ = m_spectatorClientIds.Add(clientId);
                    if (m_spectatorClientIds.Count >= MAX_SPECTATOR_COUNT)
                    {
                        var props = new ExitGames.Client.Photon.Hashtable()
                        {
                            {PhotonConnectionHandler.SPECTATOR_SLOT_OPEN, 0}
                        };
                        UGBApplication.Instance.NetworkLayer.SetRoomProperty(props);
                        m_spectatorsSetFull = true;
                    }
                }

                response.Approved = true;
                return;
            }

            Debug.LogWarning($"{clientId} - {connectionStatus} CONNECTION REJECTED");

            // In order for clients to not just get disconnected with no feedback, the server needs to tell the client why it disconnected it.
            // This could happen after an auth check on a service or because of gameplay reasons (server full, wrong build version, etc)
            // Since network objects haven't synced yet (still in the approval process), we need to send a custom message to clients, wait for
            // UTP to update a frame and flush that message, then give our response to NetworkManager's connection approval process, with a denied approval.
            IEnumerator DelayDenyApproval(NetworkManager.ConnectionApprovalResponse resp)
            {
                resp.Pending = true; // give some time for server to send connection status message to clients
                resp.Approved = false;
                SendServerToClientSetDisconnectReason(clientId, (int)connectionStatus);
                yield return null; // wait a frame so UTP can flush it's messages on next update
                resp.Pending = false; // connection approval process can be finished.
            }

            _ = StartCoroutine(DelayDenyApproval(response));
        }

        private ConnectionStatus CanClientConnect(ConnectionPayload connectionPayload)
        {
            if (connectionPayload.IsPlayer)
            {
                if (m_playersClientIds.Count >= MAX_PLAYER_COUNT)
                {
                    return ConnectionStatus.PlayerFull;
                }
            }
            else if (m_spectatorClientIds.Count >= MAX_SPECTATOR_COUNT)
            {
                return ConnectionStatus.SpectatorFull;
            }

            return ConnectionStatus.Success;
        }

        private void OnClientDisconnected(ulong clientId)
        {
            // remove the client from the proper list
            _ = m_playersClientIds.Remove(clientId);
            _ = m_spectatorClientIds.Remove(clientId);

            if (m_playersSetFull && m_playersClientIds.Count < MAX_PLAYER_COUNT)
            {
                var props = new ExitGames.Client.Photon.Hashtable() { { PhotonConnectionHandler.PLAYER_SLOT_OPEN, 1 } };
                UGBApplication.Instance.NetworkLayer.SetRoomProperty(props);
                m_playersSetFull = false;
            }

            if (m_spectatorsSetFull && m_spectatorClientIds.Count < MAX_SPECTATOR_COUNT)
            {
                var props = new ExitGames.Client.Photon.Hashtable() { { PhotonConnectionHandler.SPECTATOR_SLOT_OPEN, 1 } };
                UGBApplication.Instance.NetworkLayer.SetRoomProperty(props);
                m_spectatorsSetFull = false;
            }

            if (clientId == m_networkManager.LocalClientId)
            {
                // when server gets disconnected we clean up
                m_networkManager.OnClientDisconnectCallback -= OnClientDisconnected;
            }
        }

        private static void SendServerToClientSetDisconnectReason(ulong clientID, int status)
        {
            var writer = new FastBufferWriter(sizeof(int), Allocator.Temp);
            writer.WriteValueSafe(status);
            NetworkManager.Singleton.CustomMessagingManager.SendNamedMessage(
                nameof(NetworkLayer.ReceiveServerToClientSetDisconnectReason_CustomMessage), clientID, writer);
        }
    }
}