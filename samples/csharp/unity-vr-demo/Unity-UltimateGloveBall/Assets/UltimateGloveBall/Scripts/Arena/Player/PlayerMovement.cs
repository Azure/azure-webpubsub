// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using Meta.Multiplayer.Core;
using Meta.Utilities;
using UltimateGloveBall.App;
using UltimateGloveBall.Arena.Services;
using UltimateGloveBall.Utils;
using UnityEngine;

namespace UltimateGloveBall.Arena.Player
{
    /// <summary>
    /// Handles the players movement. The player has different types of movements that are handles accordingly.
    /// Teleport, snap/zoom, walking.
    /// It is possible to set boundaries so that the player can't move beyond those borders.
    /// The movements are based on the players head position rather than the center of the CameraRig.
    /// </summary>
    public class PlayerMovement : Singleton<PlayerMovement>
    {
        [SerializeField] private OVRCameraRig m_cameraRig;
        [SerializeField] private float m_movementSpeed = 3;
        [SerializeField] private float m_walkSpeed = 2;
        [SerializeField] private Transform m_head;
        [SerializeField] private float m_inEditorHeadHeight = 1.7f;
        private bool m_isMoving = false;
        private Vector3 m_destination;

        public bool RotationEitherThumbstick = true;
        public bool IsRotationEnabled = true;
        public float RotationAngle = 45.0f;
        private bool m_readyToSnapTurn;

        private bool m_useLimits;
        private float[] m_limits;

        private void Start()
        {
#if UNITY_EDITOR
            // In editor we set the camera to a certain height in case we don't get HMD inputs
            var localPos = m_head.localPosition;
            m_head.localPosition = localPos.SetY(m_inEditorHeadHeight);
#endif
        }

        public void SetLimits(float minX, float maxX, float minZ, float maxZ)
        {
            m_useLimits = true;
            m_limits = new float[4] { minX, maxX, minZ, maxZ };
        }

        public void ResetLimits()
        {
            m_useLimits = false;
        }

        public void SnapPositionToTransform(Transform trans)
        {
            SnapPosition(trans.position, trans.rotation);
        }

        public void SnapPosition(Vector3 destination, Quaternion rotation)
        {
            var thisTransform = transform;
            var curPosition = thisTransform.position;
            var headOffset = m_head.position - curPosition;
            headOffset.y = 0;
            destination -= headOffset;
            thisTransform.position = destination;
            thisTransform.rotation = rotation;
        }

        public void TeleportTo(Vector3 destination, Quaternion rotation)
        {
            var netTransformComp = LocalPlayerEntities.Instance.Avatar.GetComponent<ClientNetworkTransform>();
            var thisTransform = transform;
            var curPosition = thisTransform.position;
            var headOffset = m_head.position - curPosition;
            headOffset.y = 0;
            destination -= headOffset;
            thisTransform.position = destination;
            thisTransform.rotation = rotation;
            var netTransform = netTransformComp.transform;
            netTransform.position = destination;
            netTransform.rotation = rotation;
            netTransformComp.Teleport(destination, rotation, Vector3.one);
            m_isMoving = false;
            FadeOutScreen();
        }

        public void MoveTo(Vector3 destination)
        {
            FadeScreen();
            var playerTransform = transform;
            var position = playerTransform.position;
            var headOffset = m_head.position - position;
            headOffset.y = 0;
            var newPos = destination - headOffset;
            StayWithinLimits(ref newPos, Vector3.zero);
            m_destination = newPos;
            m_isMoving = true;
        }

        public void WalkInDirectionRelToForward(Vector3 direction)
        {
            var headDir = m_head.forward;
            headDir.y = 0; // remove height dir
            var dir = Quaternion.FromToRotation(Vector3.forward, headDir) * direction;
            var moveDist = Time.deltaTime * m_walkSpeed;
            var playerTransform = transform;
            var position = playerTransform.position;
            var headOffset = m_head.position - position;
            var newPos = position + dir * moveDist;
            StayWithinLimits(ref newPos, headOffset);

            transform.position = newPos;
        }

        private void StayWithinLimits(ref Vector3 newPos, Vector3 headOffset)
        {
            if (m_useLimits)
            {
                var headnewPos = newPos + headOffset;
                if (headnewPos.x < m_limits[0])
                {
                    newPos.x = m_limits[0] - headOffset.x;
                }

                if (headnewPos.x > m_limits[1])
                {
                    newPos.x = m_limits[1] - headOffset.x;
                }

                if (headnewPos.z < m_limits[2])
                {
                    newPos.z = m_limits[2] - headOffset.z;
                }

                if (headnewPos.z > m_limits[3])
                {
                    newPos.z = m_limits[3] - headOffset.z;
                }
            }
        }

        private void FadeScreen()
        {
            if (GameSettings.Instance.UseBlackoutOnSnap)
            {
                OVRScreenFade.instance.SetExplicitFade(1);
            }
        }
        private void FadeOutScreen()
        {
            if (GameSettings.Instance.UseBlackoutOnSnap)
            {
                OVRScreenFade.instance.SetExplicitFade(0);
            }
        }

        private void Update()
        {
            if (m_isMoving)
            {
                var moveDist = Time.deltaTime * m_movementSpeed;
                transform.position = Vector3.MoveTowards(transform.position, m_destination, moveDist);
                if (Vector3.SqrMagnitude(transform.position - m_destination) <= Mathf.Epsilon * Mathf.Epsilon)
                {
                    transform.position = m_destination;
                    m_isMoving = false;
                    FadeOutScreen();
                }
            }
        }

        public void DoSnapTurn(bool toRight)
        {
            if (IsRotationEnabled)

            {
                transform.RotateAround(m_cameraRig.centerEyeAnchor.position, Vector3.up, toRight ? RotationAngle : -RotationAngle);
            }
        }
    }
}