// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using Meta.Utilities;
using UnityEngine;

namespace UltimateGloveBall.Arena.Environment
{
    /// <summary>
    /// Scrolls the banner around the Arena. It animates the movement of the banner and changing the logo periodically.
    /// </summary>
    public class BannerScrolling : MonoBehaviour
    {
        private enum Phases
        {
            Paused,
            Scroll,
            Swap,
        }
        [SerializeField, AutoSet] private MeshRenderer m_meshRenderer;

        [SerializeField] private float m_movementStep = -0.05f;
        [SerializeField] private float m_stepSpeed = 0.1f;

        [SerializeField] private float m_swapStep = 0.1f;

        [SerializeField] private float m_scrollTime = 2f;
        [SerializeField] private float m_pauseTime = 2f;

        private float m_timer;
        private float m_stepTimer;
        private int m_stepCount;
        private Phases m_phase = Phases.Paused;
        private Vector2 m_scrollPosition = Vector2.zero;

        private Material m_material;
        private void Awake()
        {
            // since it's the only instance we don't need to use property block
            m_material = m_meshRenderer.material;
        }

        private void Update()
        {
            m_timer += Time.deltaTime;

            switch (m_phase)
            {
                case Phases.Paused:
                    HandlePause();
                    break;
                case Phases.Scroll:
                    HandleScroll();
                    break;
                case Phases.Swap:
                    HandleSwap();
                    break;
                default:
                    break;
            }
        }
        private void HandlePause()
        {
            if (m_timer >= m_pauseTime)
            {
                m_timer -= m_pauseTime;
                m_phase = Phases.Scroll;
            }
        }

        private void HandleScroll()
        {
            if (m_timer >= m_scrollTime)
            {
                m_timer -= m_scrollTime;
                m_phase = Phases.Swap;
                m_stepTimer = 0;
            }
            else
            {
                m_stepTimer += Time.deltaTime;
                if (m_stepTimer >= m_stepSpeed)
                {
                    m_stepTimer -= m_stepSpeed;
                    ScrollImage();
                }
            }
        }

        private void HandleSwap()
        {

            m_stepTimer += Time.deltaTime;
            if (m_stepTimer >= m_stepSpeed)
            {
                m_stepCount++;
                m_stepTimer -= m_stepSpeed;
                SwapImage();
            }

            if (m_stepCount >= Mathf.Abs(1f / m_swapStep))
            {
                m_timer = 0;
                m_phase = Phases.Paused;
                m_stepTimer = 0;
                m_stepCount = 0;
            }
        }

        private void ScrollImage()
        {
            m_scrollPosition.x += m_movementStep;
            if (m_scrollPosition.x > 1)
            {
                m_scrollPosition.x -= 1;
            }
            if (m_scrollPosition.x < -1)
            {
                m_scrollPosition.x += 1;
            }
            m_material.mainTextureOffset = m_scrollPosition;
        }

        private void SwapImage()
        {
            m_scrollPosition.y += m_swapStep / 4f; // 4 images
            if (m_scrollPosition.y > 1)
            {
                m_scrollPosition.y -= 1;
            }
            if (m_scrollPosition.y < -1)
            {
                m_scrollPosition.y += 1;
            }
            m_material.mainTextureOffset = m_scrollPosition;
        }
    }
}