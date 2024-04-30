// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System.Collections.Generic;
using TMPro;
using UltimateGloveBall.App;
using UnityEngine;
using UnityEngine.UI;

namespace UltimateGloveBall.MainMenu
{
    /// <summary>
    /// Keeps reference of the element for the settings menu.
    /// Handle settings menu actions through unity events.
    /// Set GameSettings through sliders and toggle buttons.
    /// Shows the current version of the application. 
    /// </summary>
    public class SettingsMenu : BaseMenuController
    {
        [SerializeField] private Slider m_musicVolumeSlider;
        [SerializeField] private TMP_Text m_musicVolumeValueText;

        [SerializeField] private Toggle m_snapBlackoutToggle;
        [SerializeField] private Toggle m_freeLocomotionToggle;
        [SerializeField] private Toggle m_locomotionVignetteToggle;

        [SerializeField] private TMP_Dropdown m_regionDropDown;

        [SerializeField] private TMP_Text m_versionText;

        private bool m_handleRegionChange = false;
        private void Awake()
        {
            var audioController = AudioController.Instance;
            m_musicVolumeSlider.value = audioController.MusicVolume;
            m_musicVolumeValueText.text = audioController.MusicVolumePct.ToString("N0") + "%";
            var settings = GameSettings.Instance;
            m_snapBlackoutToggle.isOn = settings.UseBlackoutOnSnap;
            m_freeLocomotionToggle.isOn = !settings.IsFreeLocomotionDisabled;
            m_locomotionVignetteToggle.isOn = settings.UseLocomotionVignette;

            m_musicVolumeSlider.onValueChanged.AddListener(OnMusicSliderChanged);
            m_snapBlackoutToggle.onValueChanged.AddListener(OnSnapBlackoutChanged);
            m_freeLocomotionToggle.onValueChanged.AddListener(OnFreeLocomotionChanged);
            m_locomotionVignetteToggle.onValueChanged.AddListener(OnLocomotionVignetteChanged);

            m_regionDropDown.onValueChanged.AddListener(OnRegionValueChanged);

            m_versionText.text = $"version: {Application.version}";
        }

        private void OnEnable()
        {
            m_regionDropDown.ClearOptions();
            List<TMP_Dropdown.OptionData> options = new();
            var networkLayer = UGBApplication.Instance.NetworkLayer;
            var currentRegion = networkLayer.GetRegion();
            var selected = -1;
            var index = 0;
            foreach (var region in networkLayer.EnabledRegions)
            {
                var code = region.Code;
                options.Add(new TMP_Dropdown.OptionData(NetworkRegionMapping.GetRegionName(code)));
                if (code == currentRegion)
                {
                    selected = index;
                }

                index++;
            }
            m_regionDropDown.AddOptions(options);
            m_handleRegionChange = false;
            m_regionDropDown.value = selected;
            m_handleRegionChange = true;
        }

        private void OnMusicSliderChanged(float val)
        {
            var audioController = AudioController.Instance;
            audioController.SetMusicVolume(val);
            m_musicVolumeValueText.text = audioController.MusicVolumePct.ToString("N0") + "%";
        }

        private void OnSnapBlackoutChanged(bool val)
        {
            GameSettings.Instance.UseBlackoutOnSnap = val;
        }

        private void OnFreeLocomotionChanged(bool val)
        {
            GameSettings.Instance.IsFreeLocomotionDisabled = !val;
        }

        private void OnLocomotionVignetteChanged(bool val)
        {
            GameSettings.Instance.UseLocomotionVignette = val;
        }

        private void OnRegionValueChanged(int region)
        {
            if (!m_handleRegionChange)
            {
                return;
            }
            var networkLayer = UGBApplication.Instance.NetworkLayer;
            networkLayer.SetRegion(networkLayer.EnabledRegions[region].Code);
        }
    }
}