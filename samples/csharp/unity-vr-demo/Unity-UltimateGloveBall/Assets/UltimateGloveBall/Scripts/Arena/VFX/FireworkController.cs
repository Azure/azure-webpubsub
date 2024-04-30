// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using UnityEngine;
using Random = UnityEngine.Random;

namespace UltimateGloveBall.Arena.VFX
{
    /// <summary>
    /// Controls the end game fireworks to play them randomly inside the winning and losing side colliders, used as
    /// editable boxes in editor to define where the fireworks can be spawned.
    /// It plays fireworks randomly from the array of firewaorks provided as well as play the firework audio sound.
    /// </summary>
    public class FireworkController : MonoBehaviour
    {
        [SerializeField] private ParticleSystem[] m_fireworks;

        [SerializeField] private Collider m_winnerCollider;
        [SerializeField] private Collider m_loserCollider;

        [SerializeField] private float m_minTime = 0.2f;
        [SerializeField] private float m_maxTime = 0.6f;

        [SerializeField] private AudioSource[] m_audioSources;
        [SerializeField] private AudioClip m_explosionSound;

        private int m_nextAudioSourceIndex = 0;

        private float m_timer = 0;
        private float m_nextAt = 0;

        private void OnEnable()
        {
            SetNextTime();
        }

        private void Update()
        {
            m_timer += Time.deltaTime;
            if (m_timer >= m_nextAt)
            {
                m_timer -= m_nextAt;
                SetNextTime();
                PlayFirework();
            }
        }

        private void PlayFirework()
        {
            var index = Random.Range(0, m_fireworks.Length);
            var winner = Random.Range(0, 2) == 0;
            var box = winner ? m_winnerCollider : m_loserCollider;
            var min = box.bounds.min;
            var max = box.bounds.max;
            var x = Random.Range(min.x, max.x);
            var y = Random.Range(min.y, max.y);
            var z = Random.Range(min.z, max.z);
            var pos = new Vector3(x, y, z);
            m_fireworks[index].transform.position = pos;
            m_fireworks[index].Play();

            var audioSource = m_audioSources[m_nextAudioSourceIndex];
            audioSource.transform.position = pos;
            audioSource.PlayOneShot(m_explosionSound);
            if (++m_nextAudioSourceIndex >= m_audioSources.Length)
            {
                m_nextAudioSourceIndex = 0;
            }
        }

        private void SetNextTime()
        {
            m_nextAt = Random.Range(m_minTime, m_maxTime);
        }
    }
}