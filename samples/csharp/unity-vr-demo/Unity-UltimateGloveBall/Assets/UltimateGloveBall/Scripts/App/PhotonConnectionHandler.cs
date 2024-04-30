// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using ExitGames.Client.Photon;
using Meta.Utilities;
using Netcode.Transports.PhotonRealtime;
using Photon.Realtime;
using UnityEngine;

namespace UltimateGloveBall.App
{
    /// <summary>
    /// Implements functions used on Photon connection. Setting the right room options based on the application state.
    /// Exposes room properties for player slots open and spectator slots open.
    /// </summary>
    public class PhotonConnectionHandler : MonoBehaviour
    {
        public const string SPECTATOR_SLOT_OPEN = "spec";
        public const string PLAYER_SLOT_OPEN = "ps";
        private const string OPEN_ROOM = "vis";

        private static bool IsSpectator => LocalPlayerState.Instance.IsSpectator;

        [SerializeField, AutoSet] private PhotonRealtimeTransport m_photonRealtimeTransport;

        private void Start()
        {
            m_photonRealtimeTransport.GetHostRoomOptionsFunc = GetHostRoomOptions;
            m_photonRealtimeTransport.GetRandomRoomParamsFunc = GetRandomRoomParams;
        }

        private void OnDestroy()
        {
            m_photonRealtimeTransport.GetHostRoomOptionsFunc = null;
            m_photonRealtimeTransport.GetRandomRoomParamsFunc = null;
        }

        private RoomOptions GetHostRoomOptions(bool usePrivateRoom, byte maxPlayers)
        {
            var roomOptions = new RoomOptions
            {
                CustomRoomPropertiesForLobby =
                        new[] { PLAYER_SLOT_OPEN, SPECTATOR_SLOT_OPEN, OPEN_ROOM },
                CustomRoomProperties = new Hashtable
                    {
                        { PLAYER_SLOT_OPEN, 1 },
                        { SPECTATOR_SLOT_OPEN, 1 },
                        { OPEN_ROOM, usePrivateRoom ? 0 : 1 }
                    },
                MaxPlayers = maxPlayers,
            };

            return roomOptions;
        }

        private OpJoinRandomRoomParams GetRandomRoomParams(byte maxPlayers)
        {
            var opJoinRandomRoomParams = new OpJoinRandomRoomParams();
            if (IsSpectator)
            {
                var expectedCustomRoomProperties = new Hashtable { { SPECTATOR_SLOT_OPEN, 1 }, { OPEN_ROOM, 1 } };
                opJoinRandomRoomParams.ExpectedMaxPlayers = maxPlayers;
                opJoinRandomRoomParams.ExpectedCustomRoomProperties = expectedCustomRoomProperties;
            }
            else
            {
                var expectedCustomRoomProperties = new Hashtable { { PLAYER_SLOT_OPEN, 1 }, { OPEN_ROOM, 1 } };
                opJoinRandomRoomParams.ExpectedMaxPlayers = maxPlayers;
                opJoinRandomRoomParams.ExpectedCustomRoomProperties = expectedCustomRoomProperties;
            }

            return opJoinRandomRoomParams;
        }
    }
}