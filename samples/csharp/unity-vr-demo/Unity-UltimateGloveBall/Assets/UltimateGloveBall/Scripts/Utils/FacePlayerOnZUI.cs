// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using UnityEngine;

namespace UltimateGloveBall.Utils
{
    /// <summary>
    /// Add this to a gameobject that we want to face the main camera and flip based on the position on the
    /// world Z axis.
    /// </summary>
    public class FacePlayerOnZUI : MonoBehaviour
    {
        private Transform m_mainCamTransform;
        private bool m_neg = false;
        private bool m_update = true;

        private void OnEnable()
        {
            if (Camera.main != null)
            {
                m_mainCamTransform = Camera.main.transform;
            }
        }

        private void Update()
        {
            if (m_mainCamTransform == null)
            {
                return;
            }

            var dir = m_mainCamTransform.position.z - transform.position.z;

            if (dir < 0 && !m_neg)
            {
                m_neg = true;
                m_update = true;
            }
            else if (dir > 0 && m_neg)
            {
                m_neg = false;
                m_update = true;
            }

            if (m_update)
            {
                transform.forward = m_neg ? Vector3.forward : -Vector3.forward;
                m_update = false;
            }
        }
    }
}