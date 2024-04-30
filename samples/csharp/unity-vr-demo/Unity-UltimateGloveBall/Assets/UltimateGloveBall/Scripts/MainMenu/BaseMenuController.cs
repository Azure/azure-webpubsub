// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace UltimateGloveBall.MainMenu
{
    /// <summary>
    /// This is the base for the menu controller that controls the different views in the MainMenu.
    /// </summary>
    public class BaseMenuController : MonoBehaviour
    {
        [SerializeField] private List<Button> m_menuButtons;

        public void Show()
        {
            gameObject.SetActive(true);
        }

        public void Hide()
        {
            gameObject.SetActive(false);
        }

        public void EnableButtons()
        {
            SetButtonState(true);
        }

        public void DisableButtons()
        {
            SetButtonState(false);
        }

        private void SetButtonState(bool enable)
        {
            if (m_menuButtons != null)
            {
                foreach (var button in m_menuButtons)
                {
                    button.interactable = enable;
                }
            }
        }
    }
}