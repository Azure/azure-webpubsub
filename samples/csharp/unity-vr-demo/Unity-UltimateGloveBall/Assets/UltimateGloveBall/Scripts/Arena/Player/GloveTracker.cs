// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using UnityEngine;

namespace UltimateGloveBall.Arena.Player
{
    /// <summary>
    /// Anchors the glove to the transform of this component.
    /// Executed after AvatarNetworking so that we follow the wrist properly
    /// </summary>
    [DefaultExecutionOrder(10100)]
    public class GloveTracker : MonoBehaviour
    {
        public Glove Glove;
        public GloveArmatureNetworking Armature;

        private void Update()
        {
            UpdateTracking();
        }

        public void UpdateTracking()
        {
            if (Glove && Armature)
            {
                // This moves the armature and hand together
                {
                    var trans = transform;
                    var wristPosition = trans.position;
                    var wristRotation = trans.rotation;

                    Glove.Move(wristPosition, wristRotation);

                    var armTrans = Armature.transform;
                    armTrans.position = wristPosition;
                    armTrans.rotation = wristRotation;
                }
            }
        }
    }
}