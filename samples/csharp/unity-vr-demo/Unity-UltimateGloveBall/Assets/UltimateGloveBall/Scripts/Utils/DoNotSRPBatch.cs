// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using UnityEngine;

namespace UltimateGloveBall.Utils
{
    /// <summary>
    /// Add this monobehaviour on a gameobject with a renderer to disable SRP Batching
    /// </summary>
    [RequireComponent(typeof(Renderer))]
    public class DoNotSRPBatch : MonoBehaviour
    {
        private void Start()
        {
            var r = GetComponent<Renderer>();
            var mpb = new MaterialPropertyBlock();
            r.GetPropertyBlock(mpb);
            r.SetPropertyBlock(mpb);
        }
    }
}