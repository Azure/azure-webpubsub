// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using UnityEngine;

namespace UltimateGloveBall.Arena.Crowd
{
    /// <summary>
    /// Representation of an NPC crowd member. It can set the face index of the body and change the attachment color.
    /// On initialization we randomize the start time and speed of the animation.
    /// The item used can also be changed.
    /// </summary>
    public class CrowdNPC : MonoBehaviour
    {
        private static readonly int s_bodyColorID = Shader.PropertyToID("_Body_Color");
        private static readonly int s_attachmentColorID = Shader.PropertyToID("_Attachment_Color");
        private static readonly int s_faceSwapID = Shader.PropertyToID("_Face_swap");
        [SerializeField] private Animator[] m_animators;
        [SerializeField] private Renderer m_faceRenderer;
        [SerializeField] private Renderer[] m_attachmentsRenderers;
        [SerializeField] private Renderer m_bodyRenderer;

        [SerializeField] private GameObject[] m_items;

        private int m_currentItemIndex;
        private MaterialPropertyBlock m_materialBlock;

        private void Awake()
        {
            for (var i = 0; i < m_items.Length; ++i)
            {
                if (m_items[i].activeSelf)
                {
                    m_currentItemIndex = i;
                    break;
                }
            }
        }

        public void Init(float timeOffset, float speed, Vector2 face)
        {
            foreach (var animator in m_animators)
            {
                if (animator != null)
                {
                    animator.speed = speed;
                    if (animator.isActiveAndEnabled)
                    {
                        var info = animator.GetCurrentAnimatorStateInfo(0);
                        animator.Play(info.shortNameHash, 0, timeOffset);
                    }
                }
            }

            m_materialBlock ??= new MaterialPropertyBlock();
            m_faceRenderer.GetPropertyBlock(m_materialBlock);
            m_materialBlock.SetVector(s_faceSwapID, face);
            m_faceRenderer.SetPropertyBlock(m_materialBlock);
        }

        public void SetColor(Color color)
        {
            m_materialBlock ??= new MaterialPropertyBlock();
            foreach (var rend in m_attachmentsRenderers)
            {
                if (rend != null)
                {
                    rend.GetPropertyBlock(m_materialBlock);
                    m_materialBlock.SetColor(s_attachmentColorID, color);
                    rend.SetPropertyBlock(m_materialBlock);
                }
            }
        }

        public void SetBodyColor(Color color)
        {
            m_materialBlock ??= new MaterialPropertyBlock();
            m_bodyRenderer.GetPropertyBlock(m_materialBlock);
            m_materialBlock.SetColor(s_bodyColorID, color);
            m_bodyRenderer.SetPropertyBlock(m_materialBlock);
        }

        public void ChangeItem(int itemIndex)
        {
            if (itemIndex >= 0 && itemIndex < m_items.Length)
            {
                m_items[m_currentItemIndex].SetActive(false);
                m_items[itemIndex].SetActive(true);
                m_currentItemIndex = itemIndex;
            }
        }
    }
}