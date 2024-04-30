// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using Meta.Utilities;
using Oculus.Avatar2;
using UltimateGloveBall.Arena.Services;
using Unity.Netcode;
using UnityEngine;

namespace UltimateGloveBall.Arena.Balls
{
    /// <summary>
    /// When this ball is thrown it doesn't follow physics, but rather homes towards its target.
    /// It has a specific throw function to be used instead of the ball network throw function.
    /// </summary>
    [RequireComponent(typeof(BallNetworking))]
    public class HomingBall : BallBehaviour
    {
        [SerializeField] private float m_homingSpeed = 1f;
        [SerializeField, AutoSet] private BallNetworking m_ballNet;
        [SerializeField, AutoSet] private Rigidbody m_rigidbody;
        private NetworkVariable<ulong> m_targetClientId = new();

        private NetworkVariable<bool> m_targetting = new();

        private ulong m_targetId = 0;
        private bool m_targettingEnabled = false;

        private void Awake()
        {
            m_ballNet.BallDied += OnBallDied;
        }

        public override void OnNetworkSpawn()
        {
            m_targetting.OnValueChanged += OnTargettingChanged;
            m_targetClientId.OnValueChanged += OnTargetChanged;
        }

        private void OnTargettingChanged(bool previousvalue, bool newvalue)
        {
            m_targettingEnabled = newvalue;
        }

        private void OnTargetChanged(ulong previousvalue, ulong newvalue)
        {
            m_targetId = newvalue;
        }

        private void OnBallDied(BallNetworking ball, bool dieInstantly)
        {
            m_targettingEnabled = false;
            m_targetting.Value = false;
        }

        public void Throw(Vector3 direction, ulong? target, float chargeUpPct)
        {
            if (target.HasValue)
            {
                m_targetId = target.Value;
                m_targettingEnabled = true;
                SetTargetingServerRPC(m_targetId);
            }

            m_ballNet.Throw(direction, chargeUpPct);
        }

        [ServerRpc]
        private void SetTargetingServerRPC(ulong target)
        {
            m_targetting.Value = true;
            m_targetClientId.Value = target;
        }

        private void FixedUpdate()
        {
            if (!m_targettingEnabled) return;

            var avatar = NetworkManager.Singleton.LocalClientId == m_targetId
                ? LocalPlayerEntities.Instance.Avatar
                : LocalPlayerEntities.Instance.GetPlayerObjects(m_targetId).Avatar;
            if (avatar == null)
            {
                return;
            }
            // aim for the chest
            var targetPosition = avatar.GetJointTransform(CAPI.ovrAvatar2JointType.Chest).position;
            var t = transform;

            var heading = targetPosition - t.position;
            var velocity = Vector3.RotateTowards(m_rigidbody.velocity, heading, m_homingSpeed * Time.fixedDeltaTime, 0);
            m_rigidbody.velocity = velocity;
        }

        public override void ResetBall()
        {
            // Reset targeting info
            m_targetId = 0;
            m_targettingEnabled = false;
        }
    }
}