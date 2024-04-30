// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System.Collections.Generic;
using Oculus.Avatar2;
using UltimateGloveBall.Arena.Gameplay;

namespace UltimateGloveBall.Arena.Player
{
    /// <summary>
    /// This keeps a reference to the game objects that forms a player entity. It also initializes once all components
    /// are assigned.
    /// </summary>
    public class PlayerGameObjects
    {
        public PlayerControllerNetwork PlayerController;
        public PlayerAvatarEntity Avatar;
        public GloveArmatureNetworking LeftGloveArmature;
        public GloveArmatureNetworking RightGloveArmature;
        public Glove LeftGloveHand;
        public Glove RightGloveHand;

        public List<TeamColoringNetComponent> ColoringComponents = new();

        public void TryAttachObjects()
        {
            if (LeftGloveHand == null || RightGloveHand == null ||
                LeftGloveArmature == null || RightGloveArmature == null ||
                Avatar == null || !Avatar.IsSkeletonReady)
            {
                return;
            }
            ColoringComponents.Clear();

            var leftWrist = Avatar.GetJointTransform(CAPI.ovrAvatar2JointType.LeftHandWrist);
            LeftGloveHand.HandAnchor = leftWrist;
            var leftTracker = leftWrist.gameObject.AddComponent<GloveTracker>();
            leftTracker.Glove = LeftGloveHand;
            leftTracker.Armature = LeftGloveArmature;
            leftTracker.UpdateTracking();
            LeftGloveArmature.ElectricTetherForHandPoint.SetParent(LeftGloveHand.transform, false);


            var rightWrist = Avatar.GetJointTransform(CAPI.ovrAvatar2JointType.RightHandWrist);
            RightGloveHand.HandAnchor = rightWrist;
            var rightTracker = rightWrist.gameObject.AddComponent<GloveTracker>();
            rightTracker.Glove = RightGloveHand;
            rightTracker.Armature = RightGloveArmature;
            rightTracker.UpdateTracking();
            RightGloveArmature.ElectricTetherForHandPoint.SetParent(RightGloveHand.transform, false);

            PlayerController.ArmatureLeft = LeftGloveArmature;
            PlayerController.ArmatureRight = RightGloveArmature;
            PlayerController.GloveLeft = LeftGloveHand.GloveNetworkComponent;
            PlayerController.GloveRight = RightGloveHand.GloveNetworkComponent;

            ColoringComponents.Add(LeftGloveHand.GetComponent<TeamColoringNetComponent>());
            ColoringComponents.Add(LeftGloveArmature.GetComponent<TeamColoringNetComponent>());
            ColoringComponents.Add(RightGloveHand.GetComponent<TeamColoringNetComponent>());
            ColoringComponents.Add(RightGloveArmature.GetComponent<TeamColoringNetComponent>());
        }
    }
}