// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using Meta.Utilities;
using Unity.Netcode;
using UnityEngine;

namespace UltimateGloveBall.Arena.Balls
{
    /// <summary>
    /// The triple ball will spawn 3 balls shortly after being thrown. The split is done only on the server and
    /// propagated to the clients.
    /// </summary>
    [RequireComponent(typeof(BallNetworking))]
    public class TripleBall : BallBehaviour
    {
        [SerializeField, AutoSet] private BallNetworking m_ballNet;
        [SerializeField, AutoSet] private Collider m_collider;
        [SerializeField] private float m_timeBeforeSplit = 0.5f;

        [SerializeField] private NetworkObject m_childBallPrefab;

        private float m_timer = 0;
        private bool m_thrown = false;
        private float m_chargeUpPct;

        private void Awake()
        {
            m_ballNet.BallShotFromServer += OnBallShotFromServer;
            m_ballNet.BallDied += OnBallDied;
            m_ballNet.OnBallShot += OnBallShot;
        }

        public override void OnDestroy()
        {
            if (m_ballNet)
            {
                m_ballNet.BallShotFromServer -= OnBallShotFromServer;
                m_ballNet.BallDied -= OnBallDied;
                m_ballNet.OnBallShot -= OnBallShot;
            }
            base.OnDestroy();
        }

        private void OnBallDied(BallNetworking ball, bool dieInstantly)
        {
            m_thrown = false;
        }

        private void OnBallShotFromServer()
        {
            m_thrown = true;
        }

        private void OnBallShot(float chargeUpPct)
        {
            m_chargeUpPct = chargeUpPct;
        }

        private void Update()
        {
            if (m_thrown)
            {
                m_timer += Time.deltaTime;
                if (m_timer >= m_timeBeforeSplit)
                {
                    ProcessSplit();
                }
            }
        }

        private void ProcessSplit()
        {
            // Disable collider to avoid collisions
            m_collider.enabled = false;
            var t = transform;
            // spawn 3 balls
            for (var i = -1; i <= 1; ++i)
            {
                var up = t.up;
                var orientation = Quaternion.AngleAxis(i * 25, up);
                var dir = Quaternion.AngleAxis(i * 25, up) * t.forward;
                var ball = BallSpawner.Instance.SpawnExtraBall(m_childBallPrefab, t.position + dir * 1f, orientation);
                ball.LaunchBall(dir, m_ballNet.ThrownTeam, m_chargeUpPct);
            }

            m_ballNet.KillBall(true, true);
        }

        public override void ResetBall()
        {
            // Reset all variables and re-enable the collider if disabled.
            m_timer = 0;
            m_thrown = false;
            m_collider.enabled = true;
        }
    }
}