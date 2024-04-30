// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using UnityEngine;
using UnityEngine.Events;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace UltimateGloveBall.MainMenu
{
    /// <summary>
    /// Implementation of the buttons to handle on hover state.
    /// This is a custom implementation so that we can keep reference of the pointers on the button as well as
    /// change the internal state of the image and text of the button when hovered.
    /// </summary>
    public class MainMenuButton : MonoBehaviour, IPointerEnterHandler, IPointerExitHandler
    {
        private static readonly Color s_highlightTextColor = new(174f / 255f, 0f, 1f);
        private static readonly Color s_normalTextColor = Color.black;

        [SerializeField] private Transform m_root;
        [SerializeField] private Image m_bgImage;
        [SerializeField] private TMPro.TMP_Text m_text;
        [SerializeField] private Color m_normalTextColor = s_normalTextColor;
        [SerializeField] private UnityEvent<string> m_onHover;
        private int m_currentPointerCount = 0;

        private void OnEnable()
        {
            // Reset
            Reset();
        }

        private void OnDisable()
        {
            Reset();
        }

        public void OnPointerEnter(PointerEventData eventData)
        {
            m_text.color = s_highlightTextColor;
            m_root.localEulerAngles = new Vector3(0, 0, 5);
            if (m_bgImage)
            {
                m_bgImage.enabled = true;
            }

            if (m_currentPointerCount == 0)
            {
                m_onHover?.Invoke(null);
            }
            m_currentPointerCount++;
        }

        public void OnPointerExit(PointerEventData eventData)
        {
            m_currentPointerCount--;
            if (m_currentPointerCount <= 0)
            {
                Reset();
            }
        }

        private void Reset()
        {
            if (m_text)
            {
                m_text.color = m_normalTextColor;
            }

            if (m_root)
            {
                m_root.localEulerAngles = Vector3.zero;
            }

            if (m_bgImage)
            {
                m_bgImage.enabled = false;
            }

            m_currentPointerCount = 0;
        }
    }
}