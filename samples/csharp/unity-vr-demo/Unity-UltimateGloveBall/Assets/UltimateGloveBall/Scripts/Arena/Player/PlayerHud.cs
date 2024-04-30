// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using Meta.Utilities;
using UltimateGloveBall.Arena.Player.Respawning;
using UltimateGloveBall.Utils;
using UnityEngine;
using UnityEngine.Assertions;

namespace UltimateGloveBall.Arena.Player
{
    /// <summary>
    /// Keeps the hud gameobject in front of the players camera with lazy tracking.
    /// </summary>
    public class PlayerHud : Singleton<PlayerHud>
    {
        #region Properties

        public RespawnHud RespawnHud => m_respawnHud;

        #endregion

        [SerializeField] private Transform m_centerEyeAnchor;

        [SerializeField] private float m_slerpValueRotation = 1f;
        [SerializeField] private float m_lerpValueHeight = 0.8f;

        [SerializeField] private RespawnHud m_respawnHud;


        private void Start()
        {
            Assert.IsNotNull(m_centerEyeAnchor, $"Forgot to serialize {nameof(m_centerEyeAnchor)}");

            ResetHudPosition();
        }

        private void Update()
        {
            var lookDirection = m_centerEyeAnchor.forward.SetY(0).normalized;
            if (lookDirection == Vector3.zero)
                lookDirection = Vector3.right; ;

            var targetRotation = Quaternion.LookRotation(lookDirection, Vector3.up);

            transform.rotation = Quaternion.Slerp(transform.rotation, targetRotation, m_slerpValueRotation * Time.deltaTime);

            var targetPosition = transform.position.SetY(m_centerEyeAnchor.position.y);

            transform.position = Vector3.Lerp(transform.position, targetPosition, m_lerpValueHeight * Time.deltaTime);
        }


        private void ResetHudPosition()
        {
            transform.rotation = Quaternion.LookRotation(m_centerEyeAnchor.forward.SetY(0).normalized, Vector3.up);

            transform.position = transform.position.SetY(m_centerEyeAnchor.position.y);
        }
    }
}
