// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using UltimateGloveBall.Arena.Player;
using UnityEngine;

namespace UltimateGloveBall.Arena.Environment
{
    /// <summary>
    /// Used on floor collider to detect collision between the floor and the glove.
    /// </summary>
    public class Floor : MonoBehaviour
    {
        private void OnTriggerEnter(Collider other)
        {
            var glove = other.gameObject.GetComponentInParent<Glove>();
            if (glove)
            {
                var dest = other.transform.position;
                dest.y = 0;
                glove.OnHitFloor(dest);
            }
        }
    }
}