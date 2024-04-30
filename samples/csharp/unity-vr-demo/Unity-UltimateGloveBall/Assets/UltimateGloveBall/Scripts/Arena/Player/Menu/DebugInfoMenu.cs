// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using TMPro;
using UltimateGloveBall.App;
using Unity.Netcode;
using UnityEngine;

namespace UltimateGloveBall.Arena.Player.Menu
{
    /// <summary>
    /// Menu that shows some debug info to the user.
    /// </summary>
    public class DebugInfoMenu : BasePlayerMenuView
    {
        [SerializeField] private TMP_Text m_serverTimeText;
        [SerializeField] private TMP_Text m_pingTimeText;
        [SerializeField] private TMP_Text m_regionText;
        [SerializeField] private TMP_Text m_fpsText;

        private void OnEnable()
        {
            m_regionText.text = NetworkRegionMapping.GetRegionShortName(UGBApplication.Instance.NetworkLayer.GetRegion());
        }

        public override void OnUpdate()
        {
            if (NetworkManager.Singleton.IsListening)
            {
                m_serverTimeText.text = NetworkManager.Singleton.ServerTime.Time.ToString("0.###");

                m_pingTimeText.text =
                    $"{NetworkManager.Singleton.NetworkConfig.NetworkTransport.GetCurrentRtt(0)} ms";
            }

            m_fpsText.text = (1f / Time.smoothDeltaTime).ToString("N0");
        }
    }
}