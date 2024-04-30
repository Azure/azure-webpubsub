// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using UnityEngine;

namespace UltimateGloveBall.App
{
    /// <summary>
    /// Wrapper over PlayerPrefs for the different settings we have in the game. The settings instance can be access
    /// to get or set the game settings.
    /// </summary>
    public class GameSettings
    {
        #region singleton
        private static GameSettings s_instance;

        public static GameSettings Instance
        {
            get
            {
                s_instance ??= new GameSettings();

                return s_instance;
            }
        }

        public static void DestroyInstance()
        {
            s_instance = null;
        }
        #endregion

        private const string KEY_MUSIC_VOLUME = "MusicVolume";
        private const string KEY_SFX_VOLUME = "SfxVolume";
        private const string KEY_CROWD_VOLUME = "CrowdVolume";
        private const string KEY_SNAP_BLACKOUT = "BalckoutOnSnap";
        private const string KEY_DISABLE_FREE_LOCOMOTION = "DisableFreeLocomotion";
        private const string KEY_LOCOMOTION_VIGNETTE = "LocomotionVignette";

        private const float DEFAULT_MUSIC_VOLUME = 0.5f;
        private const float DEFAULT_SFX_VOLUME = 1.0f;
        private const float DEFAULT_CROWD_VOLUME = 1.0f;
        private const bool DEFAULT_BLACKOUT_ON_SNAP_MOVE = false;
        private const bool DEFAULT_DISABLE_FREE_LOCOMOTION = false;
        private const bool DEFAULT_LOCOMOTION_VIGNETTE = true;

        private float m_musicVolume;
        public float MusicVolume
        {
            get => m_musicVolume;
            set
            {
                m_musicVolume = value;
                SetFloat(KEY_MUSIC_VOLUME, m_musicVolume);
            }
        }

        private float m_sfxVolume;
        public float SfxVolume
        {
            get => m_sfxVolume;
            set
            {
                m_sfxVolume = value;
                SetFloat(KEY_SFX_VOLUME, m_sfxVolume);
            }
        }
        private float m_crowdVolume;
        public float CrowdVolume
        {
            get => m_crowdVolume;
            set
            {
                m_crowdVolume = value;
                SetFloat(KEY_CROWD_VOLUME, m_crowdVolume);
            }
        }


        private bool m_useBlackoutOnSnap;
        public bool UseBlackoutOnSnap
        {
            get => m_useBlackoutOnSnap;
            set
            {
                m_useBlackoutOnSnap = value;
                SetBool(KEY_SNAP_BLACKOUT, m_useBlackoutOnSnap);
            }
        }
        private bool m_isFreeLocomotionDisabled;
        public bool IsFreeLocomotionDisabled
        {
            get => m_isFreeLocomotionDisabled;
            set
            {
                m_isFreeLocomotionDisabled = value;
                SetBool(KEY_DISABLE_FREE_LOCOMOTION, m_isFreeLocomotionDisabled);
            }
        }

        private bool m_useLocomotionVignette;
        public bool UseLocomotionVignette
        {
            get => m_useLocomotionVignette;
            set
            {
                m_useLocomotionVignette = value;
                SetBool(KEY_LOCOMOTION_VIGNETTE, m_useLocomotionVignette);
            }
        }

        private GameSettings()
        {
            m_musicVolume = PlayerPrefs.GetFloat(KEY_MUSIC_VOLUME, DEFAULT_MUSIC_VOLUME);
            m_sfxVolume = PlayerPrefs.GetFloat(KEY_SFX_VOLUME, DEFAULT_SFX_VOLUME);
            m_crowdVolume = PlayerPrefs.GetFloat(KEY_CROWD_VOLUME, DEFAULT_CROWD_VOLUME);
            m_useBlackoutOnSnap = GetBool(KEY_SNAP_BLACKOUT, DEFAULT_BLACKOUT_ON_SNAP_MOVE);
            m_isFreeLocomotionDisabled = GetBool(KEY_DISABLE_FREE_LOCOMOTION, DEFAULT_DISABLE_FREE_LOCOMOTION);
            m_useLocomotionVignette = GetBool(KEY_LOCOMOTION_VIGNETTE, DEFAULT_LOCOMOTION_VIGNETTE);
        }

        private void SetFloat(string key, float value)
        {
            PlayerPrefs.SetFloat(key, value);
        }

        private bool GetBool(string key, bool defaultValue)
        {
            return PlayerPrefs.GetInt(key, defaultValue ? 1 : 0) != 0;
        }

        private void SetBool(string key, bool value)
        {
            PlayerPrefs.SetInt(key, value ? 1 : 0);
        }
    }
}