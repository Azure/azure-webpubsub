// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityToolbarExtender;

namespace UltimateGloveBall.Editor
{
    /// <summary>
    /// Adds a quick way to load the different scenes by adding a button for each scene on the toolbar.
    /// </summary>
    public static class ScenesMenu
    {

        [InitializeOnLoadMethod]
        private static void Initialize() => ToolbarExtender.LeftToolbarGUI.Add(OnToolbarGUI);

        private static void OnToolbarGUI()
        {
            GUILayout.FlexibleSpace();
            if (GUILayout.Button(new GUIContent("Startup", "Load startup scene.")))
            {
                LoadStartup();
            }
            if (GUILayout.Button(new GUIContent("Menu", "Load startup scene.")))
            {
                LoadMenu();
            }
            if (GUILayout.Button(new GUIContent("Arena", "Load startup scene.")))
            {
                LoadArena();
            }
            GUILayout.Space(100);
        }


        [MenuItem("Scenes/Startup")]
        public static void LoadStartup()
        {
            OpenScene("Startup");
        }

        [MenuItem("Scenes/Menu")]
        public static void LoadMenu()
        {
            OpenScene("MainMenu");
        }

        [MenuItem("Scenes/Arena")]
        public static void LoadArena()
        {
            OpenScene("Arena");
        }

        [MenuItem("Scenes/Startup &1", true)]
        [MenuItem("Scenes/Menu &2", true)]
        [MenuItem("Scenes/Arena &3", true)]
        public static bool LoadSceneValidation()
        {
            return !Application.isPlaying;
        }

        private static void OpenScene(string name)
        {
            var saved = EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo();
            if (saved)
            {
                _ = EditorSceneManager.OpenScene($"Assets/UltimateGloveBall/Scenes/{name}.unity");
            }
        }
    }
}