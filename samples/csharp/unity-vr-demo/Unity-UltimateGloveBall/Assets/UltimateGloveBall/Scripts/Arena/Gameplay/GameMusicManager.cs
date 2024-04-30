// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using Meta.Utilities;
using UltimateGloveBall.Arena.Services;
using UnityEngine;

namespace UltimateGloveBall.Arena.Gameplay
{
    /// <summary>
    /// Manages which music to play based on the current game phase.
    /// </summary>
    [RequireComponent(typeof(AudioSource))]
    public class GameMusicManager : MonoBehaviour, IGamePhaseListener
    {
        [SerializeField] private GameManager m_gameManager;
        [SerializeField, AutoSet] private AudioSource m_musicAudioSource;

        [SerializeField] private AudioClip m_preGameClip;
        [SerializeField] private AudioClip m_inGameClip;
        [SerializeField] private AudioClip m_postGameClip;

        private void Awake()
        {
            m_gameManager.RegisterPhaseListener(this);
        }

        private void OnDestroy()
        {
            m_gameManager.UnregisterPhaseListener(this);
        }

        public void OnPhaseChanged(GameManager.GamePhase phase)
        {
            switch (phase)
            {
                case GameManager.GamePhase.PreGame:
                    PlayPreGameMusic();
                    break;
                case GameManager.GamePhase.CountDown:
                    // do nothing
                    break;
                case GameManager.GamePhase.InGame:
                    PlayInGameMusic();
                    break;
                case GameManager.GamePhase.PostGame:
                    PlayPostGameMusic();
                    break;
                default:
                    StopMusic();
                    break;
            }
        }

        public void OnPhaseTimeUpdate(double timeLeft)
        {
            // nothing
        }

        public void OnTeamColorUpdated(TeamColor teamColorA, TeamColor teamColorB)
        {
            // nothing
        }

        private void PlayPreGameMusic()
        {
            m_musicAudioSource.clip = m_preGameClip;
            m_musicAudioSource.Play();
        }

        private void PlayInGameMusic()
        {
            m_musicAudioSource.clip = m_inGameClip;
            m_musicAudioSource.Play();
        }

        private void PlayPostGameMusic()
        {
            m_musicAudioSource.clip = m_postGameClip;
            m_musicAudioSource.Play();
        }

        private void StopMusic()
        {
            m_musicAudioSource.Stop();
        }
    }
}
