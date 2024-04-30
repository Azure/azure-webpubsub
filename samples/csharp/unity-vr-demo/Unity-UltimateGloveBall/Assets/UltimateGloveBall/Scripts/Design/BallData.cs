// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using UnityEngine;

namespace UltimateGloveBall.Design
{
    /// <summary>
    /// Configurable scriptable object that exposes the Ball data. 
    /// </summary>
    [CreateAssetMenu(fileName = "BallData", menuName = "Balls/Data")]
    public class BallData : ScriptableObject
    {
        public float MinThrowSpeed = 5f;
        public float MaxThrowSpeed = 20f;

        public Vector3 SpawnedRotationSpeedPerSec = new(45, 90, 0);

        public Vector3 ThrownRotationPerSecMin = new(360, 0, 0);
        public Vector3 ThrownRotationPerSecMax = new(720, 0, 0);
    }
}