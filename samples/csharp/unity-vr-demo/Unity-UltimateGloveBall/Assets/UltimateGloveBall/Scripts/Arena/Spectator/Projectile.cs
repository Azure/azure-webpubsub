// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using UnityEngine;

namespace UltimateGloveBall.Arena.Spectator
{
    /// <summary>
    /// Projectile logic used to move a gameobject based on the launched information.
    /// </summary>
    public class Projectile : MonoBehaviour
    {
        private Vector3 m_startPos;
        private Vector3 m_destination;
        private float m_travelTime;
        private float m_timer;

        public void Launch(Vector3 startPos, Vector3 destination, float travelTime)
        {
            m_startPos = startPos;
            m_destination = destination;
            m_travelTime = travelTime;
            var thisTransform = transform;
            thisTransform.position = m_startPos;
            thisTransform.forward = m_destination - m_startPos;
            m_timer = 0;
            gameObject.SetActive(true);
        }

        private void Update()
        {
            if (m_timer < m_travelTime)
            {
                m_timer += Time.deltaTime;
                transform.position = Vector3.Lerp(m_startPos, m_destination, m_timer / m_travelTime);
            }
            else
            {
                gameObject.SetActive(false);
            }
        }
    }
}