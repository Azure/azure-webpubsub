// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System.Collections;
using UltimateGloveBall.Arena.Balls;
using UltimateGloveBall.Arena.Services;
using Unity.Netcode;
using UnityEngine;

namespace UltimateGloveBall.Arena.Player
{
    /// <summary>
    /// The player shield controller will handle changing the visual state on hit and update the color of the shield
    /// based on the energy level.
    /// </summary>
    public class Shield : MonoBehaviour
    {
        private const float HIT_TEXTURE_TIME = 1f;

        private static readonly int s_shieldColorParam = Shader.PropertyToID("_Color");
        private static readonly int s_hitTimeParam = Shader.PropertyToID("_HitTime");

        [SerializeField] private GloveArmatureNetworking m_armatureNet;

        [SerializeField] private Color m_fullEnergyColor;
        [SerializeField] private Color m_lowEnergyColor;

        [SerializeField] private MeshRenderer[] m_shieldRenderers;

        private float m_hitTextureTimer;
        private bool m_inHitState;

        private MaterialPropertyBlock m_materialBlock;

        private void OnDisable()
        {
            if (m_inHitState)
            {
                StopCoroutine(SwapBackToUnhitWhenReady());
                m_inHitState = false;
                RemoveKeyWord("_HITENABLED");
            }
        }

        private void OnCollisionEnter(Collision collision)
        {
            var ball = collision.gameObject.GetComponent<BallNetworking>();
            if (ball != null && !ball.HasOwner)
            {
                OnBallHit();
            }
        }

        private void OnTriggerEnter(Collider other)
        {
            if (!NetworkManager.Singleton.IsServer)
            {
                return;
            }

            var fireball = other.gameObject.GetComponent<ElectricBall>();
            if (fireball != null && !fireball.Ball.HasOwner && fireball.Ball.IsAlive)
            {
                var controller = m_armatureNet.OwnerClientId == NetworkManager.Singleton.LocalClientId
                    ? LocalPlayerEntities.Instance.LocalPlayerController
                    : LocalPlayerEntities.Instance.GetPlayerObjects(m_armatureNet.OwnerClientId).PlayerController;
                controller.OnShieldHit(m_armatureNet.Side);
            }
        }

        public void UpdateChargeLevel(float chargeLevel)
        {
            m_materialBlock ??= new MaterialPropertyBlock();

            foreach (var shieldRenderer in m_shieldRenderers)
            {
                shieldRenderer.GetPropertyBlock(m_materialBlock);
                var color = Color.Lerp(m_lowEnergyColor, m_fullEnergyColor, chargeLevel / 100f);
                m_materialBlock.SetColor(s_shieldColorParam, color);
                shieldRenderer.SetPropertyBlock(m_materialBlock);
            }
        }

        private void OnBallHit()
        {
            m_hitTextureTimer = HIT_TEXTURE_TIME;
            if (!m_inHitState)
            {
                m_inHitState = true;
                SetKeyWord("_HITENABLED");
                _ = StartCoroutine(SwapBackToUnhitWhenReady());
            }
        }

        private IEnumerator SwapBackToUnhitWhenReady()
        {
            while (m_hitTextureTimer >= 0)
            {
                m_hitTextureTimer -= Time.deltaTime;
                SetValue(s_hitTimeParam, Mathf.Lerp(0, 1, 1f - m_hitTextureTimer / HIT_TEXTURE_TIME));
                yield return null;
            }

            m_inHitState = false;
            RemoveKeyWord("_HITENABLED");
        }

        private void SetValue(int valueId, float value)
        {
            m_materialBlock ??= new MaterialPropertyBlock();

            foreach (var shieldRenderer in m_shieldRenderers)
            {
                shieldRenderer.GetPropertyBlock(m_materialBlock);
                m_materialBlock.SetFloat(valueId, value);
                shieldRenderer.SetPropertyBlock(m_materialBlock);
            }
        }

        private void SetKeyWord(string keyword)
        {
            foreach (var shieldRenderer in m_shieldRenderers)
            {
                shieldRenderer.material.EnableKeyword(keyword);
            }
        }

        private void RemoveKeyWord(string keyword)
        {
            foreach (var shieldRenderer in m_shieldRenderers)
            {
                shieldRenderer.material.DisableKeyword(keyword);
            }
        }
    }
}