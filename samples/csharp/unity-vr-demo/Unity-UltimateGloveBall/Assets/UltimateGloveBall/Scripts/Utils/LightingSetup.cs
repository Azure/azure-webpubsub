// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

#if UNITY_EDITOR
using UnityEditor;
#endif
using UnityEngine;

namespace UltimateGloveBall.Utils
{
    /// <summary>
    /// This scipt keeps references of gameobject to enable, gameobjects to set to static GI and
    /// process the crowd to enable GI before we generate the lighting.
    /// You can trigger it by using the context menu of the component in inspector.
    /// Setup for Lighting: will setup the scene ready for the light baking
    /// Revert after lighting: will revert the changes set by "Setup for Lighting"
    /// </summary>
    public class LightingSetup : MonoBehaviour
    {
        [SerializeField] private GameObject[] m_objectsToEnable;
        [SerializeField] private Transform m_crowdRoot;
        [SerializeField] private GameObject[] m_contributeToGIStatic;

        [ContextMenu("Setup for Lighting")]
        private void Setup()
        {
            foreach (var obj in m_objectsToEnable)
            {
                obj.SetActive(true);
            }

            ProcessCrowdRecursively(m_crowdRoot, true);

            ProcessContributeToGI(true);
        }

        [ContextMenu("Revert after lighting")]
        private void RevertSetup()
        {
            foreach (var obj in m_objectsToEnable)
            {
                obj.SetActive(false);
            }

            ProcessCrowdRecursively(m_crowdRoot, false);
        }

        private void ProcessCrowdRecursively(Transform root, bool forLighting)
        {
            var go = root.gameObject;
            if (go.TryGetComponent(out Renderer _))
            {
                if (go.name.Contains("Body"))
                {
                    SetContributeGIFlag(go, forLighting);
                }

            }
            for (var i = 0; i < root.childCount; i++)
            {
                ProcessCrowdRecursively(root.GetChild(i), forLighting);
            }
        }

        private void ProcessContributeToGI(bool forLighting)
        {
            foreach (var go in m_contributeToGIStatic)
            {
                SetContributeGIFlag(go, forLighting);
            }
        }

        private void SetContributeGIFlag(GameObject go, bool forLighting)
        {
            if (go == null)
            {
                return;
            }
#if UNITY_EDITOR
            var flags = GameObjectUtility.GetStaticEditorFlags(go);
            if (forLighting)
            {
                GameObjectUtility.SetStaticEditorFlags(go, flags | StaticEditorFlags.ContributeGI);
            }
            else
            {
                GameObjectUtility.SetStaticEditorFlags(go, flags & ~StaticEditorFlags.ContributeGI);
            }
#endif
        }
    }


}