// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using TMPro;
using UltimateGloveBall.App;
using UltimateGloveBall.Arena.Spectator;
using Unity.Netcode;
using UnityEngine;
using UnityEngine.UI;

namespace UltimateGloveBall.Arena.Player.Menu
{
    /// <summary>
    /// Game settings menu view for the in game menu.
    /// </summary>
    public class InGameSettingsMenu : BasePlayerMenuView
    {
        [SerializeField] private Slider m_musicVolumeSlider;
        [SerializeField] private TMP_Text m_musicVolumeValueText;

        [SerializeField] private Slider m_sfxVolumeSlider;
        [SerializeField] private TMP_Text m_sfxVolumeValueText;

        [SerializeField] private Slider m_crowdVolumeSlider;
        [SerializeField] private TMP_Text m_crowdVolumeValueText;

        [SerializeField] private Toggle m_snapBlackoutToggle;
        [SerializeField] private Toggle m_freeLocomotionToggle;
        [SerializeField] private Toggle m_locomotionVignetteToggle;

        [Header("Spectator")]
        [SerializeField] private Button m_switchSideButton;

        private void Start()
        {
            m_musicVolumeSlider.onValueChanged.AddListener(OnMusicSliderChanged);
            m_sfxVolumeSlider.onValueChanged.AddListener(OnSfxSliderChanged);
            m_crowdVolumeSlider.onValueChanged.AddListener(OnCrowdSliderChanged);
            m_snapBlackoutToggle.onValueChanged.AddListener(OnSnapBlackoutChanged);
            m_freeLocomotionToggle.onValueChanged.AddListener(OnFreeLocomotionChanged);
            m_locomotionVignetteToggle.onValueChanged.AddListener(OnLocomotionVignetteChanged);
        }

        private void OnEnable()
        {
            m_switchSideButton.gameObject.SetActive(LocalPlayerState.Instance.IsSpectator);

            var audioController = AudioController.Instance;
            m_musicVolumeSlider.value = audioController.MusicVolume;
            m_musicVolumeValueText.text = audioController.MusicVolumePct.ToString("N0") + "%";
            m_sfxVolumeSlider.value = audioController.SfxVolume;
            m_sfxVolumeValueText.text = audioController.SfxVolumePct.ToString("N0") + "%";
            m_crowdVolumeSlider.value = audioController.CrowdVolume;
            m_crowdVolumeValueText.text = audioController.CrowdVolumePct.ToString("N0") + "%";
            var settings = GameSettings.Instance;
            m_snapBlackoutToggle.isOn = settings.UseBlackoutOnSnap;
            m_freeLocomotionToggle.isOn = !settings.IsFreeLocomotionDisabled;
            m_locomotionVignetteToggle.isOn = settings.UseLocomotionVignette;

        }

        public void OnSwitchSidesButtonClicked()
        {
            var spectatorNet =
                NetworkManager.Singleton.SpawnManager.GetLocalPlayerObject().GetComponent<SpectatorNetwork>();

            spectatorNet.RequestSwitchSide();
        }

        private void OnMusicSliderChanged(float val)
        {
            var audioController = AudioController.Instance;
            audioController.SetMusicVolume(val);
            m_musicVolumeValueText.text = audioController.MusicVolumePct.ToString("N0") + "%";
        }

        private void OnSfxSliderChanged(float val)
        {
            var audioController = AudioController.Instance;
            audioController.SetSfxVolume(val);
            m_sfxVolumeValueText.text = audioController.SfxVolumePct.ToString("N0") + "%";
        }

        private void OnCrowdSliderChanged(float val)
        {
            var audioController = AudioController.Instance;
            audioController.SetCrowdVolume(val);
            m_crowdVolumeValueText.text = audioController.CrowdVolumePct.ToString("N0") + "%";
        }

        private void OnSnapBlackoutChanged(bool val)
        {
            GameSettings.Instance.UseBlackoutOnSnap = val;
        }

        private void OnFreeLocomotionChanged(bool val)
        {
            GameSettings.Instance.IsFreeLocomotionDisabled = !val;
            PlayerInputController.Instance.OnSettingsUpdated();
        }

        private void OnLocomotionVignetteChanged(bool val)
        {
            GameSettings.Instance.UseLocomotionVignette = val;
        }
    }
}