// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System.Collections.Generic;
using UnityEngine;

namespace UltimateGloveBall.Arena.Player
{
    /// <summary>
    /// Controls the animation of the spring based on the players press state. 
    /// </summary>
    public class GloveSpringController : MonoBehaviour
    {
        private const float COMPRESSION_RATE = 300f;
        private const float DECOMPRESSION_RATE = 1200f;
        [SerializeField] private List<SkinnedMeshRenderer> m_meshes;
        [SerializeField] private ParticleSystem m_steamVFX;

        [SerializeField] private AudioSource m_springAudioSource;
        [SerializeField] private AudioClip m_springChargeAudio;
        [SerializeField] private AudioClip m_springReleaseAudio;

        private bool m_activated = false;
        private float m_compression = 0;
        private bool m_animating = false;

        public float Compression => Mathf.Clamp01(m_compression / 100f);

        public void Activate()
        {
            if (!m_activated)
            {
                m_springAudioSource.Stop();
                m_springAudioSource.clip = m_springChargeAudio;
                m_springAudioSource.Play();
            }
            m_activated = true;
            m_animating = true;
        }

        public void Deactivate()
        {
            if (m_activated)
            {
                m_steamVFX.Play(true);
                m_springAudioSource.Stop();
                m_springAudioSource.clip = m_springReleaseAudio;
                m_springAudioSource.Play();
            }
            m_activated = false;
            m_animating = true;
        }

        private void Update()
        {
            if (m_animating)
            {
                if (m_activated)
                {
                    m_compression += Time.deltaTime * COMPRESSION_RATE;
                    if (m_compression >= 100f)
                    {
                        m_compression = 100f;
                        m_animating = false;
                    }
                }
                else
                {
                    m_compression -= Time.deltaTime * DECOMPRESSION_RATE;
                    if (m_compression <= 0f)
                    {
                        m_compression = 0f;
                        m_animating = false;
                    }
                }

                UpdateCompression();
            }
        }

        private void UpdateCompression()
        {
            foreach (var mesh in m_meshes)
            {
                // only one blend Shape at index 0
                mesh.SetBlendShapeWeight(0, m_compression);
            }
        }
    }
}