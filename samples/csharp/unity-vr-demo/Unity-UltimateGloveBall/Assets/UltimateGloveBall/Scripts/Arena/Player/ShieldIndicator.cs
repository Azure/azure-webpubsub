// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System.Collections.Generic;
using UnityEngine;

namespace UltimateGloveBall.Arena.Player
{
    /// <summary>
    /// Controls the shield indicator state on the glove armature. Updating the visual to show the level of energy
    /// remaining for the shield and the charging state.
    /// </summary>
    public class ShieldIndicator : MonoBehaviour
    {
        private static readonly int s_emissionParam = Shader.PropertyToID("_EmissionColor");

        private static readonly int s_baseColorParam = Shader.PropertyToID("_BaseColor");

        // 4 sections
        [SerializeField] private List<Renderer> m_sections;
        [SerializeField] private Renderer m_indicatorMesh;

        [ColorUsage(true, true)]
        [SerializeField] private Color m_disabledMainColor;

        [ColorUsage(true, true)]
        [SerializeField] private Color m_disabledEmissionColor;

        private readonly List<Color> m_baseSectionColors = new();

        [ColorUsage(true, true)] private readonly List<Color> m_emissionSectionColors = new();

        private Color m_indicatorMeshBaseColor;

        [ColorUsage(true, true)] private Color m_indicatorMeshEmissionColor;

        private MaterialPropertyBlock m_materialPropertyBlock;

        private float m_pctPerSection = 25;

        private void Awake()
        {
            if (m_sections.Count > 0)
            {
                m_pctPerSection = 100f / m_sections.Count;
            }

            m_materialPropertyBlock = new MaterialPropertyBlock();

            if (m_emissionSectionColors.Count == 0)
            {
                for (var i = 0; i < m_sections.Count; ++i)
                {
                    var section = m_sections[i];
                    var material = section.sharedMaterial;
                    m_baseSectionColors.Add(material.color);
                    m_emissionSectionColors.Add(material.GetVector(s_emissionParam));
                }

                {
                    var material = m_indicatorMesh.sharedMaterial;
                    m_indicatorMeshBaseColor = material.color;
                    m_indicatorMeshEmissionColor = material.GetVector(s_emissionParam);
                }
            }
        }

        public void UpdateChargeLevel(float charge)
        {
            for (var i = 0; i < m_sections.Count; ++i)
            {
                var curSectionPct = i * m_pctPerSection;
                var show = curSectionPct < charge;
                m_sections[i].enabled = show;
            }
        }

        public void SetDisabledState()
        {
            for (var i = 0; i < m_sections.Count; ++i)
            {
                var section = m_sections[i];
                section.GetPropertyBlock(m_materialPropertyBlock);
                m_materialPropertyBlock.SetVector(s_emissionParam, m_disabledEmissionColor);
                m_materialPropertyBlock.SetColor(s_baseColorParam, m_disabledMainColor);
                section.SetPropertyBlock(m_materialPropertyBlock);
            }

            m_indicatorMesh.GetPropertyBlock(m_materialPropertyBlock);
            m_materialPropertyBlock.SetVector(s_emissionParam, m_disabledEmissionColor);
            m_materialPropertyBlock.SetColor(s_baseColorParam, m_disabledMainColor);
            m_indicatorMesh.SetPropertyBlock(m_materialPropertyBlock);
        }

        public void SetEnabledState()
        {
            for (var i = 0; i < m_sections.Count; ++i)
            {
                var section = m_sections[i];
                section.GetPropertyBlock(m_materialPropertyBlock);
                m_materialPropertyBlock.SetVector(s_emissionParam, m_emissionSectionColors[i]);
                m_materialPropertyBlock.SetColor(s_baseColorParam, m_baseSectionColors[i]);
                section.SetPropertyBlock(m_materialPropertyBlock);
            }

            m_indicatorMesh.GetPropertyBlock(m_materialPropertyBlock);
            m_materialPropertyBlock.SetVector(s_emissionParam, m_indicatorMeshEmissionColor);
            m_materialPropertyBlock.SetColor(s_baseColorParam, m_indicatorMeshBaseColor);
            m_indicatorMesh.SetPropertyBlock(m_materialPropertyBlock);
        }
    }
}