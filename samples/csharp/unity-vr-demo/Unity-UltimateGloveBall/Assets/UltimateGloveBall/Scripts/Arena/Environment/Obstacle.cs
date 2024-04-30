// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using Meta.Utilities;
using UltimateGloveBall.Arena.Balls;
using UltimateGloveBall.Arena.Gameplay;
using UltimateGloveBall.Arena.Player;
using UltimateGloveBall.Arena.Services;
using UltimateGloveBall.Arena.VFX;
using Unity.Netcode;
using UnityEngine;

namespace UltimateGloveBall.Arena.Environment
{
    /// <summary>
    /// Networked obstacles in the game. They keep the inflation state in sync. Handles sounds on collision and color.
    /// </summary>
    public class Obstacle : NetworkBehaviour
    {
        private const float INFLATION_RATE = 70f;
        private const float DEFLATION_RATE = 60f;
        private const float TIME_BEFORE_REFLATION = 6f;
        [SerializeField, AutoSet] private TeamColoringNetComponent m_teamColoring;
        [SerializeField] private Collider m_collisionCollider;
        [SerializeField] private SkinnedMeshRenderer m_mesh;

        [Header("Collider Data")]
        [SerializeField] private Vector3 m_colliderCenterInflated;
        [SerializeField] private Vector3 m_colliderCenterDeflated;
        [SerializeField] private float m_colliderHeightInflated;
        [SerializeField] private float m_colliderHeightDeflated;

        [Header("Sounds")]
        [SerializeField] private AudioSource m_audioSource;
        [SerializeField] private AudioClip m_inflateSound;
        [SerializeField] private AudioClip m_deflateSound;
        [SerializeField] private AudioClip m_punctureSound;

        private NetworkVariable<bool> m_inflated = new(true);

        private CapsuleCollider m_capsuleCollider = null;
        private SphereCollider m_sphereCollider = null;

        private float m_deflatedPct = 100;

        private float m_reflationTimer = 0;

        private void Awake()
        {
            if (m_collisionCollider is CapsuleCollider)
            {
                m_capsuleCollider = m_collisionCollider as CapsuleCollider;
            }
            else if (m_collisionCollider is SphereCollider)
            {
                m_sphereCollider = m_collisionCollider as SphereCollider;
            }
        }

        public override void OnNetworkSpawn()
        {
            m_inflated.OnValueChanged += OnInflatedStateChanged;
        }

        private void OnInflatedStateChanged(bool previousvalue, bool newvalue)
        {
            if (previousvalue != newvalue)
            {
                m_audioSource.Stop();
                bool playSound;
                if (newvalue)
                {
                    m_audioSource.clip = m_inflateSound;
                    playSound = m_deflatedPct > 0;
                }
                else
                {
                    m_audioSource.clip = m_deflateSound;
                    playSound = m_deflatedPct < 100;
                }

                if (playSound)
                {
                    m_audioSource.Play();
                }
            }
        }

        public void UpdateColor(TeamColor color)
        {
            m_teamColoring.TeamColor = color;
        }

        private void OnCollisionEnter(Collision collision)
        {
            if (IsServer)
            {
                if (collision.gameObject.GetComponent<PlayerAvatarEntity>() != null)
                {
                    m_inflated.Value = false;
                }
            }
        }

        private void OnTriggerEnter(Collider other)
        {
            var glove = other.gameObject.GetComponentInParent<Glove>();
            if (glove)
            {
                glove.OnHitObstacle();
                return;
            }

            if (m_inflated.Value)
            {
                var fireBall = other.gameObject.GetComponent<ElectricBall>();
                if (fireBall != null && fireBall.Ball.IsAlive)
                {
                    if (IsServer)
                    {
                        m_inflated.Value = false;
                        TriggerPunctureClientRPC();
                    }

                    var ballPosition = other.transform.position;
                    var contact = m_collisionCollider.ClosestPointOnBounds(ballPosition);
                    VFXManager.Instance.PlayHitVFX(contact, ballPosition - contact);
                }
            }

        }

        private void Update()
        {
            if (m_inflated.Value && m_deflatedPct > 0)
            {
                m_deflatedPct -= INFLATION_RATE * Time.deltaTime;
                if (m_deflatedPct <= 0)
                {
                    m_deflatedPct = 0;
                    m_audioSource.Stop();
                }

                UpdateDeflation();
            }
            else if (!m_inflated.Value && m_deflatedPct < 100)
            {
                m_deflatedPct += DEFLATION_RATE * Time.deltaTime;
                if (m_deflatedPct >= 100)
                {
                    m_deflatedPct = 100;
                    m_reflationTimer = 0;
                    m_audioSource.Stop();
                }

                UpdateDeflation();
            }

            if (IsServer && !m_inflated.Value && m_deflatedPct >= 100)
            {
                m_reflationTimer += Time.deltaTime;
                if (m_reflationTimer >= TIME_BEFORE_REFLATION)
                {
                    m_reflationTimer = 0;
                    m_inflated.Value = true;
                }
            }
        }

        private void UpdateDeflation()
        {
            m_mesh.SetBlendShapeWeight(0, m_deflatedPct);
            var deflated01 = m_deflatedPct / 100f;
            if (m_capsuleCollider != null)
            {
                m_capsuleCollider.center = Vector3.Lerp(m_colliderCenterInflated, m_colliderCenterDeflated, deflated01);
                m_capsuleCollider.height = Mathf.Lerp(m_colliderHeightInflated, m_colliderHeightDeflated, deflated01);
            }
            else if (m_sphereCollider != null)
            {
                m_sphereCollider.center = Vector3.Lerp(m_colliderCenterInflated, m_colliderCenterDeflated, deflated01);
            }
        }

        [ClientRpc]
        private void TriggerPunctureClientRPC()
        {
            m_audioSource.PlayOneShot(m_punctureSound);
        }
    }
}