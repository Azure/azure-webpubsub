// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System.Collections.Generic;
using Meta.Utilities;
using UnityEngine;

namespace UltimateGloveBall.Arena.VFX
{
    /// <summary>
    /// Manages the game vfx.
    /// Keeps a circular list of the hit vfx and play them sequentially.
    /// </summary>
    public class VFXManager : Singleton<VFXManager>
    {
        [SerializeField] private List<ParticleSystem> m_hitVfxs;

        private int m_hitVFXIndex;

        public void PlayHitVFX(Vector3 position, Vector3 forward)
        {
            var fx = m_hitVfxs[m_hitVFXIndex++];
            var trans = fx.transform;
            trans.position = position;
            trans.forward = forward;
            fx.Play(true);
            if (m_hitVFXIndex >= m_hitVfxs.Count)
            {
                m_hitVFXIndex = 0;
            }
        }
    }
}