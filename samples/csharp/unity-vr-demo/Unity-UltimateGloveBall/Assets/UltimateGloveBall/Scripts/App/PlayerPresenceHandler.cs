// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System.Collections;
using System.Collections.Generic;
using Meta.Multiplayer.Core;
using Oculus.Platform;
using UnityEngine;

namespace UltimateGloveBall.App
{
    /// <summary>
    /// Handles the current user presence.
    /// Loads and keeps track of the Destinations through the RichPresence API and extract the deeplink message.
    /// Generate and exposes the current group presence state.
    /// </summary>
    public class PlayerPresenceHandler
    {
        private bool m_destinationReceived;
        private readonly Dictionary<string, string> m_destinationsAPIToDisplayName = new();
        private readonly Dictionary<string, string> m_destinationsAPIToRegion = new();
        private readonly Dictionary<string, string> m_regionToDestinationAPI = new();

        public GroupPresenceState GroupPresenceState { get; private set; }

        public IEnumerator Init()
        {
            _ = RichPresence.GetDestinations().OnComplete(OnGetDestinations);
            yield return new WaitUntil(() => m_destinationReceived);
        }

        public IEnumerator GenerateNewGroupPresence(string dest, string roomName = null)
        {
            GroupPresenceState ??= new GroupPresenceState();
            var lobbyId = string.Empty;
            var joinable = false;
            if (dest != "MainMenu")
            {
                lobbyId = roomName ?? $"Arena-{LocalPlayerState.Instance.Username}-{(uint)(Random.value * uint.MaxValue)}";
                joinable = true;
            }
            return GroupPresenceState.Set(
                dest,
                lobbyId,
                string.Empty,
                joinable
            );
        }

        // Based on the region we are connected we use the right Arena Destination API
        public string GetArenaDestinationAPI(string region)
        {
            return !m_regionToDestinationAPI.TryGetValue(region, out var destAPI) ? "Arena" : destAPI;
        }

        public string GetDestinationDisplayName(string destinationAPI)
        {
            if (!m_destinationsAPIToDisplayName.TryGetValue(destinationAPI, out var displayName))
            {
                displayName = destinationAPI;
            }

            return displayName;
        }

        public string GetRegionFromDestination(string destinationAPI)
        {
            if (!m_destinationsAPIToRegion.TryGetValue(destinationAPI, out var region))
            {
                region = "usw";
            }
            return region;
        }

        private void OnGetDestinations(Message<Oculus.Platform.Models.DestinationList> message)
        {
            if (message.IsError)
            {
                LogError("Could not get the list of destinations!", message.GetError());
            }
            else
            {
                foreach (var destination in message.Data)
                {
                    var apiName = destination.ApiName;
                    m_destinationsAPIToDisplayName[apiName] = destination.DisplayName;
                    // For Arenas we detect what region they are in by betting the region in the deeplink message
                    if (apiName.StartsWith("Arena"))
                    {
                        Debug.Log($"@@@ JsonUtility.FromJson<ArenaDeepLinkMessage>(destination.DeeplinkMessage), {destination.DeeplinkMessage}");
                        var msg = JsonUtility.FromJson<ArenaDeepLinkMessage>(destination.DeeplinkMessage);
                        m_destinationsAPIToRegion[apiName] = msg.Region;
                        if (!string.IsNullOrEmpty(msg.Region))
                        {
                            m_regionToDestinationAPI[msg.Region] = apiName;
                        }
                    }
                }
            }
            m_destinationReceived = true;
        }

        private void LogError(string message, Oculus.Platform.Models.Error error)
        {
            Debug.LogError($"{message}" +
                           $"ERROR MESSAGE:   {error.Message}" +
                           $"ERROR CODE:      {error.Code}" +
                           $"ERROR HTTP CODE: {error.HttpCode}");
        }
    }
}