// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using TMPro;
using UnityEngine;

namespace UltimateGloveBall.MainMenu
{
    /// <summary>
    /// Keeps reference to the element on the Error Panel and handles setting the message and showing the panel.
    /// </summary>
    public class MenuErrorPanel : MonoBehaviour
    {
        private const string DEFAULT_TITLE = "ERROR";

        [SerializeField] private TMP_Text m_titleText;
        [SerializeField] private TMP_Text m_messageText;

        public void ShowMessage(string message, string title = DEFAULT_TITLE)
        {
            m_titleText.text = title;
            m_messageText.text = message;
            gameObject.SetActive(true);
        }

        public void Close()
        {
            gameObject.SetActive(false);
        }
    }
}