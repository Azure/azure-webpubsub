// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using UnityEngine;

namespace UltimateGloveBall.Arena.Balls
{
    /// <summary>
    /// The spawn points keeps track of the ball it has keeps a state if a ball is currently on the spawn point
    /// or was taken.
    /// </summary>
    [RequireComponent(typeof(BoxCollider))]
    public class SpawnPoint : MonoBehaviour
    {
        public bool Claimed => OwnedBall != null;

        public GameObject OwnedBall { get; set; } = null;

        private void OnTriggerExit(Collider other)
        {
            if (other.gameObject == OwnedBall)
            {
                OwnedBall = null;
            }
        }
    }
}
