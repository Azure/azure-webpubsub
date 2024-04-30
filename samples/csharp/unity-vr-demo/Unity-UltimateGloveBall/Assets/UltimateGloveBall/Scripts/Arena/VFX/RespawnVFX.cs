// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using Meta.Multiplayer.Avatar;
using Oculus.Avatar2;
using UnityEngine;

namespace UltimateGloveBall.Arena.VFX
{
    /// <summary>
    /// Component to be placed on the Respawn VFX game object. It animates the disolve amount on the material overtime.
    /// As soon as the gameobject is enable the animation starts and when the animation is done it will deactivate the
    /// gameobject.
    /// </summary>
    public class RespawnVFX : MonoBehaviour
    {
        private static readonly int s_dissolveAmountParam = Shader.PropertyToID("_DisAmount");
        [SerializeField] private float m_startDissolveAmount;
        [SerializeField] private float m_endDissolveAmount;
        [SerializeField] private float m_duration;
        [SerializeField] private MeshRenderer m_meshRenderer;
        [SerializeField] private AvatarEntity m_avatar;
        private MaterialPropertyBlock m_materialBlock;
        private float m_timer;
        private bool m_active;
        private void Awake()
        {
            m_materialBlock = new MaterialPropertyBlock();
        }

        private void OnEnable()
        {
            if (m_avatar != null)
            {
                var chest = m_avatar.GetJointTransform(CAPI.ovrAvatar2JointType.Chest);
                var chestPos = chest.position;
                var newPos = chestPos;
                newPos.y = transform.position.y;
                transform.position = newPos;
            }
            m_meshRenderer.GetPropertyBlock(m_materialBlock);
            m_materialBlock.SetFloat(s_dissolveAmountParam, m_startDissolveAmount);
            m_meshRenderer.SetPropertyBlock(m_materialBlock);
            m_timer = 0;
            m_active = true;
        }

        public void Update()
        {
            if (!m_active)
            {
                gameObject.SetActive(false);
                return;
            }

            m_timer += Time.deltaTime;
            m_meshRenderer.GetPropertyBlock(m_materialBlock);
            m_materialBlock.SetFloat(s_dissolveAmountParam,
                Mathf.Lerp(m_startDissolveAmount, m_endDissolveAmount, m_timer / m_duration));
            m_meshRenderer.SetPropertyBlock(m_materialBlock);
            if (m_timer >= m_duration)
            {
                m_active = false;
            }
        }
    }
}