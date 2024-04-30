// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using Meta.Utilities;
using UltimateGloveBall.Arena.Services;
using Unity.Netcode;
using UnityEngine;

namespace UltimateGloveBall.Arena.Balls
{
    /// <summary>
    /// The ghost ball will change to a bland ball after the effect timer runs out. It also set the player holding the
    /// ball to be in an invulnerable state. When thrown the player loses the invunerability.
    /// </summary>
    public class GhostBall : BallBehaviour
    {
        [SerializeField, AutoSet] private BallNetworking m_ballNet;
        [SerializeField, AutoSet] private AudioSource m_audioSource;
        [SerializeField] private GameObject m_ghostBallVisual;
        [SerializeField] private GameObject m_blandBallVisual;
        [SerializeField] private ParticleSystem m_transformationVFX;
        [SerializeField] private float m_effectTimeSec = 15f;
        [SerializeField] private AudioClip m_onBallChangedAudioClip;

        private float m_ownershipTimer;
        private bool m_isGhostMode = true;

        private ulong m_currentOwner = int.MaxValue;

        private void Awake()
        {
            m_ballNet.BallDied += OnBallDied;
            m_ballNet.OnOwnerChanged += OnOwnerChanged;
        }

        private void Update()
        {
            if (IsServer)
            {
                if (m_isGhostMode && m_ballNet.HasOwner)
                {
                    m_ownershipTimer += Time.deltaTime;
                    if (m_ownershipTimer >= m_effectTimeSec)
                    {
                        m_isGhostMode = false;
                        SwitchToBlandBallClientRPC(true);
                    }
                }
            }
        }

        public override void ResetBall()
        {
            m_isGhostMode = true;
            m_ownershipTimer = 0;
            m_blandBallVisual.SetActive(false);
            m_ghostBallVisual.SetActive(true);
        }

        private void OnBallDied(BallNetworking obj, bool dieInstantly)
        {
            m_isGhostMode = false;
            SwitchToBlandBallClientRPC(false);
        }

        private void OnOwnerChanged(ulong previousOwner, ulong newOwner)
        {
            if (previousOwner != newOwner && previousOwner != ulong.MaxValue)
            {
                var ents = LocalPlayerEntities.Instance.GetPlayerObjects(previousOwner);
                ents.PlayerController.RemoveInvulnerability(this);
            }

            if (m_isGhostMode && newOwner != ulong.MaxValue)
            {
                var ents = LocalPlayerEntities.Instance.GetPlayerObjects(newOwner);
                ents.PlayerController.SetInvulnerability(this);
            }

            m_currentOwner = newOwner;
        }


        [ClientRpc]
        private void SwitchToBlandBallClientRPC(bool playVfx)
        {
            m_isGhostMode = false;
            m_blandBallVisual.SetActive(true);
            m_ghostBallVisual.SetActive(false);
            if (playVfx)
            {
                m_transformationVFX.Play();
                m_audioSource.PlayOneShot(m_onBallChangedAudioClip);
            }

            if (m_ballNet.HasOwner)
            {
                var ents = LocalPlayerEntities.Instance.GetPlayerObjects(m_currentOwner);
                ents.PlayerController.RemoveInvulnerability(this);
            }
        }
    }
}