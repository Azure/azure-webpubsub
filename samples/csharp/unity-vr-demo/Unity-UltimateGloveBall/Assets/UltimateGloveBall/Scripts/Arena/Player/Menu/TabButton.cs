// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using Meta.Utilities;
using UltimateGloveBall.MainMenu;
using UnityEngine;
using UnityEngine.UI;

namespace UltimateGloveBall.Arena.Player.Menu
{
    /// <summary>
    /// Controls the Tab button at the top of the Player in game menu.
    /// </summary>
    public class TabButton : MonoBehaviour
    {
        [SerializeField, AutoSet] private Button m_button;
        [SerializeField, AutoSet] private MainMenuButton m_menuButtonBehaviour;
        [SerializeField] private Image m_bgImage;

        private Color m_selectedColor;
        private Color m_unselectedColor;

        public void Setup(Color selectedColor, Color unselectedColor)
        {
            m_selectedColor = selectedColor;
            m_unselectedColor = unselectedColor;
        }

        public void OnSelected()
        {
            m_button.interactable = false;
            m_bgImage.color = m_selectedColor;
            m_menuButtonBehaviour.enabled = false;
        }

        public void OnDeselected()
        {
            m_button.interactable = true;
            m_bgImage.color = m_unselectedColor;
            m_menuButtonBehaviour.enabled = true;
        }
    }
}