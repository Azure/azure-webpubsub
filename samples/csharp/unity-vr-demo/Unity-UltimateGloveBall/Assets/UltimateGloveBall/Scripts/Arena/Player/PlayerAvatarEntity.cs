// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using Meta.Multiplayer.Avatar;
using Oculus.Avatar2;
using UltimateGloveBall.Arena.Services;
using Unity.Netcode;
using UnityEngine;

namespace UltimateGloveBall.Arena.Player
{
    /// <summary>
    /// Implementation of the AvatarEntity specific to Glove Ball.
    /// When the skeleton is loaded we reference it to the players entities and enable the respawn vfx.
    /// We apply the fixed hand pose so the avatar hands are always in a fist during game play.
    /// </summary>
    public class PlayerAvatarEntity : AvatarEntity
    {
        [SerializeField] private OvrAvatarCustomHandPose m_rightHandPose;
        [SerializeField] private OvrAvatarCustomHandPose m_leftHandPose;
        [SerializeField] private GameObject m_respawnVfx;
        public bool IsSkeletonReady { get; private set; } = false;

        protected override void OnSkeletonLoaded()
        {
            base.OnSkeletonLoaded();
            IsSkeletonReady = true;
            var netComp = GetComponent<NetworkObject>();
            if (netComp.IsOwner)
            {
                LocalPlayerEntities.Instance.Avatar = this;
                LocalPlayerEntities.Instance.TryAttachGloves();

                if (m_rightHandPose != null)
                {
                    m_rightHandPose.enabled = true;
                }

                if (m_leftHandPose != null)
                {
                    m_leftHandPose.enabled = true;
                }
            }
            else
            {
                var playerObjects = LocalPlayerEntities.Instance.GetPlayerObjects(netComp.OwnerClientId);
                playerObjects.Avatar = this;
                playerObjects.TryAttachObjects();
            }

            // OnShow respawnVFX when the avatar is loaded
            if (m_respawnVfx)
            {
                m_respawnVfx.SetActive(true);
            }
        }
    }
}