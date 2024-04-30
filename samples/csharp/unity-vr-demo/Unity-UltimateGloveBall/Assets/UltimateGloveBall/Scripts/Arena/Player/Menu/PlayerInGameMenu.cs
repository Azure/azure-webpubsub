// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System.Collections;
using UltimateGloveBall.App;
using UnityEngine;

namespace UltimateGloveBall.Arena.Player.Menu
{
    /// <summary>
    /// In game player menu that shows different menu based on which tab is selected.
    /// It handles hiding itself when the application loses focus, like when the user opens the OS menu, and will
    /// reappear when gaining back focus.
    /// </summary>
    public class PlayerInGameMenu : MonoBehaviour
    {
        private enum ViewType
        {
            Settings,
            Info,
            Players,
        }

        private const float UPDATE_FREQUENCY = 0.25f;
        [SerializeField] private GameObject m_menuRoot;
        [SerializeField] private Color m_tabSelectedColor;
        [SerializeField] private Color m_tabUnselectedColor;
        [SerializeField] private Collider m_canvasCollider;
        [SerializeField] private float m_closingSqrMagnitude = 9;
        [SerializeField] private BasePlayerMenuView m_settingsView;
        [SerializeField] private BasePlayerMenuView m_debugInfoView;
        [SerializeField] private BasePlayerMenuView m_playersView;

        [Header("Tabs")]
        [SerializeField] private TabButton m_tabSettingButton;
        [SerializeField] private TabButton m_tabDebugInfoButton;
        [SerializeField] private TabButton m_tabPlayersButton;

        private Transform m_cameraTransform;
        private float m_updateTimer = UPDATE_FREQUENCY;

        private BasePlayerMenuView m_currentView;

        private void Awake()
        {
            if (Camera.main != null)
            {
                m_cameraTransform = Camera.main.transform;
            }

            m_tabSettingButton.Setup(m_tabSelectedColor, m_tabUnselectedColor);
            m_tabDebugInfoButton.Setup(m_tabSelectedColor, m_tabUnselectedColor);
            m_tabPlayersButton.Setup(m_tabSelectedColor, m_tabUnselectedColor);

            HideAllViews();
            ShowView(ViewType.Settings);
        }

        private void OnApplicationFocus(bool focusStatus)
        {
            // Hide the menu when we loose focus
            m_menuRoot.SetActive(focusStatus);
        }

        public void Toggle()
        {
            if (gameObject.activeSelf)
            {
                Hide();
            }
            else
            {
                Show();
            }
        }
        public void Show()
        {
            if (!gameObject.activeSelf)
            {
                gameObject.SetActive(true);
                // in case the root was hidden during focus lost and the menu is closed, we want to make sure it's
                // visible when we open it.
                m_menuRoot.SetActive(true);
                var thisTrans = transform;
                // we place it in front of the player at the height of their head
                var forward = m_cameraTransform.forward;
                forward.y = 0;
                thisTrans.position = m_cameraTransform.position + forward * 2f;
            }
        }

        public void Hide()
        {
            if (gameObject.activeSelf)
            {
                gameObject.SetActive(false);
            }
        }

        private void Update()
        {
            m_updateTimer += Time.deltaTime;
            if (m_updateTimer >= UPDATE_FREQUENCY)
            {
                m_updateTimer = UPDATE_FREQUENCY - m_updateTimer;

                m_currentView.OnUpdate();
            }

            if ((m_cameraTransform.position - transform.position).sqrMagnitude > m_closingSqrMagnitude)
            {
                Hide();
            }
        }
        public void OnSettingsClicked()
        {
            ShowView(ViewType.Settings);
        }

        public void OnDebugInfoClicked()
        {
            ShowView(ViewType.Info);
        }

        public void OnPlayersTabClicked()
        {
            ShowView(ViewType.Players);
        }

        public void OnQuitButtonClicked()
        {
            UGBApplication.Instance.NavigationController.GoToMainMenu();
            _ = StartCoroutine(Disable());
        }

        private void ShowView(ViewType viewType)
        {
            if (m_currentView)
            {
                m_currentView.gameObject.SetActive(false);
            }
            switch (viewType)
            {
                case ViewType.Info:
                    m_currentView = m_debugInfoView;
                    break;
                case ViewType.Settings:
                    m_currentView = m_settingsView;
                    break;
                case ViewType.Players:
                    m_currentView = m_playersView;
                    break;
                default:
                    break;
            }

            m_currentView.gameObject.SetActive(true);
            UpdateTabs(viewType);
        }

        private void HideAllViews()
        {
            m_debugInfoView.gameObject.SetActive(false);
            m_settingsView.gameObject.SetActive(false);
            m_playersView.gameObject.SetActive(false);
        }

        private IEnumerator Disable()
        {
            yield return new WaitForEndOfFrame();
            m_canvasCollider.enabled = false;
        }

        private void UpdateTabs(ViewType selectedView)
        {
            if (selectedView == ViewType.Settings)
            {
                m_tabSettingButton.OnSelected();
            }
            else
            {
                m_tabSettingButton.OnDeselected();
            }

            if (selectedView == ViewType.Info)
            {
                m_tabDebugInfoButton.OnSelected();
            }
            else
            {
                m_tabDebugInfoButton.OnDeselected();
            }

            if (selectedView == ViewType.Players)
            {
                m_tabPlayersButton.OnSelected();
            }
            else
            {
                m_tabPlayersButton.OnDeselected();
            }
        }

        private void OnGUI()
        {
            if (GUILayout.Button("Quit"))
            {
                OnQuitButtonClicked();
            }
        }
    }
}