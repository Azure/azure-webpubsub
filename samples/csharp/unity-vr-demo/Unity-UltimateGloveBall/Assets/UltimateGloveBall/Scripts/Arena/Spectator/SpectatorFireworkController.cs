// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System.Collections;
using Meta.Utilities;
using UnityEngine;

namespace UltimateGloveBall.Arena.Spectator
{
    /// <summary>
    /// Singleton to control the fireworks triggered by the spectators.
    /// </summary>
    public class SpectatorFireworkController : Singleton<SpectatorFireworkController>
    {
        private const float FIREWORK_MAX_TRAVEL_TIME = 1.0f;
        private const float FIREWORK_TRAVEL_SPEED = 10f;
        private const float FIREWORK_MAX_TRAVEL_DIST = FIREWORK_TRAVEL_SPEED / FIREWORK_MAX_TRAVEL_TIME;

        [SerializeField] private ParticleSystem[] m_fireworks;
        [SerializeField] private AudioSource[] m_fireworksAudioSources;
        [SerializeField] private AudioClip m_fireworkSound;

        private int m_audioSourceIndex = 0;

        public Vector3 LaunchFirework(Vector3 position, Vector3 forward, out float travelTime)
        {
            var destination = position + forward * FIREWORK_MAX_TRAVEL_DIST;
            if (destination.y < 1)
            {
                destination.y = 1;
                destination = position + forward * Vector3.Dot(destination - position, forward);
            }

            // check if inside court
            if (Mathf.Abs(destination.x) < 6f && Mathf.Abs(destination.z) < 11)
            {
                if (destination.y < 5)
                {
                    // find positive y on ellipse (11 x 7)
                    var y = Mathf.Sqrt((1 - destination.z * destination.z / 121) * 49);
                    if (destination.y < y)
                    {
                        // find the z of intersection (11 x 7)
                        var z = Mathf.Sqrt((1 - destination.y * destination.y / 49) * 121);
                        if (destination.z < 0)
                        {
                            z = -z;
                        }

                        destination = new Vector3(destination.x, destination.y, z);

                        // find the destination on the line trajectory
                        destination = position + forward * Vector3.Dot(destination - position, forward);
                    }
                }
            }

            travelTime = (destination - position).magnitude / FIREWORK_TRAVEL_SPEED;
            _ = StartCoroutine(LaunchFirework(destination, travelTime));
            return destination;
        }

        public void DelayFireworkAt(Vector3 destination, float travelTime)
        {
            _ = StartCoroutine(LaunchFirework(destination, travelTime));
        }

        private IEnumerator LaunchFirework(Vector3 destination, float travelTime)
        {
            var timer = Time.deltaTime;
            while (timer < travelTime)
            {
                yield return null;
                timer += Time.deltaTime;
            }

            PlayFirework(destination);
        }

        private void PlayFirework(Vector3 destination)
        {
            var firework = m_fireworks[Random.Range(0, m_fireworks.Length)];
            firework.transform.position = destination;
            firework.Play();
            var audioSource = m_fireworksAudioSources[m_audioSourceIndex];
            audioSource.transform.position = destination;
            audioSource.PlayOneShot(m_fireworkSound);
            if (++m_audioSourceIndex >= m_fireworksAudioSources.Length)
            {
                m_audioSourceIndex = 0;
            }
        }
    }
}