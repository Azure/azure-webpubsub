// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using UnityEngine;

namespace UltimateGloveBall.Arena.VFX
{
    /// <summary>
    /// Component added to the electric vfx gameobject using a line renderer.
    /// </summary>
    [RequireComponent(typeof(LineRenderer))]
    public class Electric : MonoBehaviour
    {
        private const int POINTS_COUNT = 5;
        private const int HALF = 2;

        private const int POINT_INDEX_A = 0;
        private const int POINT_INDEX_B = 1;
        private const int POINT_INDEX_C = 2;
        private const int POINT_INDEX_D = 3;
        private const int POINT_INDEX_E = 4;

        private static readonly int s_mainTex = Shader.PropertyToID("_MainTex");

        [SerializeField] private Transform m_transformPointA;
        [SerializeField] private Transform m_transformPointB;

        [SerializeField] private float m_timerTimeOut = 0.0135f;

        private float m_timer;
        private LineRenderer m_lRend;
        private Vector2 m_mainTextureOffset = Vector2.one;
        private Vector2 m_mainTextureScale = Vector2.one;
        private Vector3[] m_points;
        private float m_randomness;

        private void Start()
        {
            m_lRend = GetComponent<LineRenderer>();
            m_points = new Vector3[POINTS_COUNT];
            m_lRend.positionCount = POINTS_COUNT;
        }

        private void Update()
        {
            CalculatePoints();
        }

        private void CalculatePoints()
        {
            m_timer += Time.deltaTime;

            if (m_timer > m_timerTimeOut)
            {
                m_timer = 0;

                m_points[POINT_INDEX_A] = m_transformPointA.position;
                m_points[POINT_INDEX_E] = m_transformPointB.position;
                m_points[POINT_INDEX_C] = GetCenter(m_points[POINT_INDEX_A], m_points[POINT_INDEX_E]);
                m_points[POINT_INDEX_B] = GetCenter(m_points[POINT_INDEX_A], m_points[POINT_INDEX_C]);
                m_points[POINT_INDEX_D] = GetCenter(m_points[POINT_INDEX_C], m_points[POINT_INDEX_E]);

                var distance = Vector3.Distance(m_transformPointA.position, m_transformPointB.position) /
                               m_points.Length;
                m_mainTextureScale.x = distance;
                m_mainTextureOffset.x = Random.Range(-m_randomness, m_randomness);
                m_lRend.material.SetTextureScale(s_mainTex, m_mainTextureScale);
                m_lRend.material.SetTextureOffset(s_mainTex, m_mainTextureOffset);

                m_randomness = distance / (POINTS_COUNT * HALF);

                SetRandomness();

                m_lRend.SetPositions(m_points);
            }
        }

        public void SetRandomness()
        {
            for (var i = 0; i < m_points.Length; i++)
            {
                if (i is not POINT_INDEX_A and not POINT_INDEX_E)
                {
                    m_points[i].x += Random.Range(-m_randomness, m_randomness);
                    m_points[i].y += Random.Range(-m_randomness, m_randomness);
                    m_points[i].z += Random.Range(-m_randomness, m_randomness);
                }
            }
        }

        private Vector3 GetCenter(Vector3 a, Vector3 b)
        {
            return (a + b) / HALF;
        }
    }
}