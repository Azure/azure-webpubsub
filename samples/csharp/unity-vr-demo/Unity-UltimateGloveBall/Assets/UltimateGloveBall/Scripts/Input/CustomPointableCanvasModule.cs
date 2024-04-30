// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using Oculus.Interaction;
using UnityEngine.XR;

namespace UltimateGloveBall.Input
{
    /// <summary>
    /// Override of the PointableCanvasModule so that we can use the mouse pointer in editor when not headset is
    /// destected instead of using the pointable canvas module.
    /// </summary>
    public class CustomPointableCanvasModule : PointableCanvasModule
    {
        public override bool IsModuleSupported()
        {
            return XRSettings.isDeviceActive && base.IsModuleSupported();
        }
    }
}