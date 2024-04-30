// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using UnityEngine;

namespace UltimateGloveBall.Design
{
    /// <summary>
    /// Configurable Scriptable Object for Ball audio clips.
    /// </summary>
    [CreateAssetMenu(fileName = "BallAudio", menuName = "Balls/Audio")]
    public class BallAudio : ScriptableObject
    {
        public AudioClip BallBounceClip;
        public AudioClip BallHitClip;
        public AudioClip BallHitShieldClip;
        public AudioClip BallGrabbedClip;
    }
}