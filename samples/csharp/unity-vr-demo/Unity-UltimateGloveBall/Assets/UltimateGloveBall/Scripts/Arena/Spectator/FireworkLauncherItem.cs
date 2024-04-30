// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System;
using System.Collections;
using UnityEngine;

namespace UltimateGloveBall.Arena.Spectator
{
    /// <summary>
    /// This spectator item has custom logic to launch a firework in the arena.
    /// </summary>
    public class FireworkLauncherItem : SpectatorItem
    {
        private const float FIREWORK_RECHARGE = 5.0f;

        [SerializeField] private Transform m_muzzleLocation;
        [SerializeField] private ParticleSystem m_muzzleVFX;
        [SerializeField] private AudioSource m_audioSource;
        [SerializeField] private AudioClip m_launchSound;
        [SerializeField] private AudioClip m_failedLaunchSound;
        [SerializeField] private GameObject m_projectileVisual;

        [SerializeField] private Projectile m_projectilePrefab;

        private Projectile m_projectile;

        private bool m_readyToLaunch = true;
        private float m_rechargeTimer;

        public Action<Vector3, float> OnLaunch;

        private void Awake()
        {
            m_projectile = Instantiate(m_projectilePrefab);
            m_projectile.gameObject.SetActive(false);
        }

        public void TryLaunch()
        {
            if (!m_readyToLaunch)
            {
                m_audioSource.PlayOneShot(m_failedLaunchSound);
                return;
            }

            var destination =
                SpectatorFireworkController.Instance.LaunchFirework(m_muzzleLocation.position, m_muzzleLocation.forward,
                    out var travelTime);
            m_audioSource.PlayOneShot(m_launchSound);
            m_readyToLaunch = false;
            _ = StartCoroutine(Recharge());

            OnLaunch?.Invoke(destination, travelTime);
            m_muzzleVFX.Play();
            m_projectileVisual.SetActive(false);
            m_projectile.Launch(m_muzzleLocation.position, destination, travelTime);
        }

        private IEnumerator Recharge()
        {
            m_rechargeTimer = 0;
            while (m_rechargeTimer < FIREWORK_RECHARGE)
            {
                yield return null;
                m_rechargeTimer += Time.deltaTime;
            }

            m_readyToLaunch = true;
            m_projectileVisual.SetActive(true);
        }
    }
}