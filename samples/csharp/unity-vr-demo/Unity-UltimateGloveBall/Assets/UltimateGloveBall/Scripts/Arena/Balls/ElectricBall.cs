// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using Meta.Utilities;
using Unity.Netcode;
using UnityEngine;

namespace UltimateGloveBall.Arena.Balls
{
    /// <summary>
    /// The electric ball needs to handle it's vfx when the state of the ball changes.
    /// This will turn off the vfx when the ball dies and reenable it on reset.
    /// </summary>
    [RequireComponent(typeof(BallNetworking))]
    public class ElectricBall : BallBehaviour
    {
        [SerializeField, AutoSet] private BallNetworking m_ballNet;
        [SerializeField] private GameObject m_vfx;

        public BallNetworking Ball => m_ballNet;

        private void Awake()
        {
            m_ballNet.BallDied += OnBallDied;
        }

        private void OnBallDied(BallNetworking obj, bool dieInstantly)
        {
            TurnOfVFXClientRPC();
        }

        [ClientRpc]
        private void TurnOfVFXClientRPC()
        {
            m_vfx.SetActive(false);
        }

        public override void ResetBall()
        {
            m_vfx.SetActive(true);
        }
    }
}