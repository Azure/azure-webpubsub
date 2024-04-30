// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System;
using Meta.Utilities;
using Oculus.Avatar2;
using Oculus.Interaction;
using UltimateGloveBall.Arena.Balls;
using UltimateGloveBall.Arena.Environment;
using UltimateGloveBall.Arena.Gameplay;
using UltimateGloveBall.Arena.Services;
using UnityEngine;

namespace UltimateGloveBall.Arena.Player
{
    /// <summary>
    /// Handles the local logic of the gloves. Glove movement, actions trigger, target tracking for homing ball,
    /// targeting indicator to floor and balls, holding balls, 
    /// </summary>
    public class Glove : MonoBehaviour
    {
        public enum GloveSide
        {
            Left,
            Right,
        }

        public enum State
        {
            Anchored,
            Flying,
        }

        [SerializeField] private float m_travelDistance = 3;
        [SerializeField] private float m_travelSpeed = 0.5f;

        [SerializeField] private Collider m_collider;

        [SerializeField, AutoSet] private Rigidbody m_rigidbody;

        [SerializeField] private Transform m_ballAnchor;

        [SerializeField, AutoSet] private GloveNetworking m_gloveNetworking;

        [SerializeField] private ParticleSystem m_ballLaunchVFX;

        [SerializeField] private GameObject m_targetIndicatorPrefab;
        [SerializeField] private float m_maxAngleHomingTarget = 45f;

        [SerializeField] private GameObject m_cheveronPrefab;
        [SerializeField] private LODGroup m_lodGroup;

        public State CurrentState { get; private set; } = State.Anchored;

        public GloveNetworking GloveNetworkComponent => m_gloveNetworking;

        public bool HasBall => CurrentBall != null;

        public Transform HandAnchor = null;

        private RayInteractor m_uiRayInteractor;

        // flying data
        private Vector3 m_destination;
        private bool m_flyingBack = false;

        public BallNetworking CurrentBall { get; private set; } = null;

        private bool m_actionPressed = false;

        private ulong? m_selectedTargetId = null;
        private bool m_findTarget = false;
        private GameObject m_targetIndicator = null;

        private GameObject m_chevronVisual;
        private readonly RaycastHit[] m_chevronRaycastResults = new RaycastHit[20];
        private bool m_chevronOnABall = false;

        public bool TriedGrabbingBall { get; private set; } = false;

        public Func<bool> IsMovementEnabled;

        private void OnEnable()
        {
            m_gloveNetworking.OnTryGrabBall += OnTryGrabBall;
        }

        private void OnDisable()
        {
            m_gloveNetworking.OnTryGrabBall -= OnTryGrabBall;
            if (m_targetIndicator != null)
            {
                m_targetIndicator.SetActive(false);
            }

            if (m_chevronVisual != null)
            {
                m_chevronVisual.SetActive(false);
            }

            // On Disable we reanchor the hand
            CurrentState = State.Anchored;
        }

        private void OnTryGrabBall()
        {
            TriedGrabbingBall = true;
        }

        public void SetRayInteractor(RayInteractor interactor)
        {
            m_uiRayInteractor = interactor;
        }

        public void SetLODLocal()
        {
            m_lodGroup.ForceLOD(0);
        }

        public void ResetGlove()
        {
            CurrentState = State.Anchored;
        }

        public void Move(Vector3 position, Quaternion rotation)
        {
            var isOwner = m_gloveNetworking.IsOwner;
            if ((isOwner && CurrentState == State.Anchored) || (!isOwner && !m_gloveNetworking.Flying))
            {
                var trans = transform;
                trans.position = position;
                trans.rotation = rotation;
                UpdateBall();
            }
        }

        public void TriggerAction(bool released, float chargeUpPct = 0)
        {
            // If we hove on UI the glove is not active and can't trigger an action
            if (m_uiRayInteractor.State == InteractorState.Hover)
            {
                m_actionPressed = false;
                return;
            }

            switch (CurrentState)
            {
                case State.Anchored:
                    {
                        if (released)
                        {
                            if (m_actionPressed)
                            {
                                if (CurrentBall != null)
                                {
                                    ThrowBall(chargeUpPct);
                                }
                                else
                                {
                                    SendGlove();
                                }
                            }

                            m_actionPressed = false;
                        }
                        else
                        {
                            m_actionPressed = true;
                        }
                    }

                    break;
                case State.Flying:
                    break;
                default:
                    break;
            }
        }

        public void AssignBall(BallNetworking ball)
        {
            m_gloveNetworking.Grabbed = true;
            SetCurrentBall(ball);
            m_collider.enabled = false;

            // return to player when we catch a ball
            m_flyingBack = true;

            if (CurrentBall.BallBehaviour is HomingBall)
            {
                m_findTarget = true;
                m_selectedTargetId = null;
            }
        }

        /// <summary>
        ///     Set the current ball connected to this glove. Will force its position to be updated by the glove.
        /// </summary>
        /// <param name="ball"></param>
        public void SetCurrentBall(BallNetworking ball)
        {
            CurrentBall = ball;
            if (ball == null)
            {
                m_gloveNetworking.Grabbed = false;
            }
        }

        private void Update()
        {
            UpdateBall();
            if (m_gloveNetworking.IsOwner)
            {
                UpdateTarget();
                UpdateCheveron();
            }
        }

        private void UpdateBall()
        {
            if (CurrentBall != null)
            {
                var ballTrans = CurrentBall.transform;
                ballTrans.position = m_ballAnchor.position;
                ballTrans.rotation = m_ballAnchor.rotation;
            }
        }

        private void UpdateTarget()
        {
            if (!m_findTarget || !m_gloveNetworking.IsOwner) return;

            if (CurrentBall == null)
            {
                m_findTarget = false;
                m_selectedTargetId = null;
                if (m_targetIndicator != null)
                {
                    m_targetIndicator.SetActive(false);
                }

                return;
            }

            // Find Homing ball target
            var savedAngle = float.MaxValue;
            m_selectedTargetId = null;
            PlayerAvatarEntity targetAvatar = null;
            var myTeam = LocalPlayerEntities.Instance.LocalPlayerController.NetworkedTeamComp.MyTeam;
            foreach (var clientId in LocalPlayerEntities.Instance.PlayerIds)
            {
                if (clientId == m_gloveNetworking.OwnerClientId)
                {
                    continue;
                }

                var playerObjects = LocalPlayerEntities.Instance.GetPlayerObjects(clientId);
                var player = playerObjects.PlayerController;
                // this player left
                if (player == null)
                {
                    continue;
                }

                var team = player.NetworkedTeamComp.MyTeam;
                if (team != myTeam)
                {
                    if (player.RespawnController.KnockedOut.Value)
                    {
                        continue;
                    }

                    var targetDir = player.transform.position - transform.position;
                    targetDir.y = 0;
                    var forward = m_ballAnchor.forward;
                    forward.y = 0;

                    var angle = Mathf.Abs(Vector3.Angle(forward, targetDir));
                    if (angle <= m_maxAngleHomingTarget && angle < savedAngle)
                    {
                        savedAngle = angle;
                        m_selectedTargetId = clientId;
                        targetAvatar = playerObjects.Avatar;
                    }
                }
            }

            if (targetAvatar != null)
            {
                var targetPos = targetAvatar.GetJointTransform(CAPI.ovrAvatar2JointType.Chest).position;

                if (m_targetIndicator == null)
                {
                    m_targetIndicator = Instantiate(m_targetIndicatorPrefab);
                }

                m_targetIndicator.SetActive(true);
                m_targetIndicator.transform.position = targetPos;
            }
            else
            {
                if (m_targetIndicator != null)
                {
                    m_targetIndicator.SetActive(false);
                }
            }
        }

        private void UpdateCheveron()
        {
            var show = false;
            m_chevronOnABall = false;
            if (IsMovementEnabled() && m_actionPressed && CurrentState == State.Anchored && CurrentBall == null)
            {
                var foundFloor = false;
                var floorPosition = Vector3.zero;
                var foundBall = false;
                var ballPosition = Vector3.zero;
                // + 1 add extra buffer for collider size
                var hitCount = Physics.BoxCastNonAlloc(m_ballAnchor.position, new Vector3(0.1f, 0.07f, 0.1f),
                    m_ballAnchor.forward,
                    m_chevronRaycastResults, Quaternion.identity, m_travelDistance + 1,
                    ObjectLayers.DEFAULT_AND_BALL_SPAWN_MASK,
                    QueryTriggerInteraction.Collide);
                for (var i = 0; i < hitCount; ++i)
                {
                    var hit = m_chevronRaycastResults[i];
                    if (hit.transform.gameObject.GetComponent<Floor>() != null)
                    {
                        foundFloor = true;
                        floorPosition = hit.point;
                        show = true;
                    }

                    if (hit.transform.gameObject.GetComponent<BallNetworking>() != null)
                    {
                        ballPosition = hit.transform.position + Vector3.up * 0.25f; // ball radius is 0.25 radius
                        foundBall = true;
                        show = true;
                        break; // stop on first ball found
                    }
                }

                if (foundFloor || foundBall)
                {
                    if (m_chevronVisual == null)
                    {
                        m_chevronVisual = Instantiate(m_cheveronPrefab);
                    }

                    var position = foundBall ? ballPosition : floorPosition;
                    m_chevronVisual.transform.position = position;
                }

                m_chevronOnABall = foundBall;
            }

            if (m_chevronVisual != null && m_chevronVisual.activeSelf != show)
            {
                m_chevronVisual.SetActive(show);
            }
        }

        public void DropBall()
        {
            if (!CurrentBall)
            {
                return;
            }

            m_gloveNetworking.Grabbed = false;
            CurrentBall.Drop();
            CurrentBall = null;
        }

        private void ThrowBall(float chargeUpPct)
        {
            if (!CurrentBall)
            {
                return;
            }

            m_ballLaunchVFX.Play(true);
            m_gloveNetworking.Grabbed = false;
            if (CurrentBall.BallBehaviour is HomingBall ball)
            {
                ball.Throw(m_ballAnchor.forward, m_selectedTargetId, chargeUpPct);
            }
            else
            {
                CurrentBall.Throw(m_ballAnchor.forward, chargeUpPct);
            }

            CurrentBall = null;
        }

        private void SendGlove()
        {
            TriedGrabbingBall = false;
            m_collider.enabled = true;
            CurrentState = State.Flying;
            m_gloveNetworking.Flying = true;
            var trans = transform;
            m_destination = trans.position + m_ballAnchor.forward * m_travelDistance;
            m_flyingBack = false;
        }

        private void FixedUpdate()
        {
            if (CurrentState == State.Flying)
            {
                var distance = Time.fixedDeltaTime * m_travelSpeed;
                var dest = m_flyingBack ? HandAnchor.position : m_destination;
                var dir = dest - transform.position;
                var normDir = dir.normalized;
                if (dir.sqrMagnitude <= distance * distance)
                {
                    // reached destination
                    // do a first move to destination and then start move back
                    m_rigidbody.MovePosition(dest);

                    if (m_flyingBack)
                    {
                        CurrentState = State.Anchored;
                        m_gloveNetworking.Flying = false;
                        m_collider.enabled = false;
                        return;
                    }

                    // update the distance with difference
                    distance = Mathf.Max(0, distance - dir.magnitude);
                    normDir = (HandAnchor.position - transform.position).normalized;
                    m_flyingBack = true;
                }

                if (distance > 0)
                {
                    m_rigidbody.MovePosition(transform.position + normDir * distance);
                }
            }
        }

        public void OnHitFloor(Vector3 dest)
        {
            if (IsMovementEnabled() && !m_chevronOnABall && !TriedGrabbingBall && m_gloveNetworking.IsOwner)
            {
                // Limit to each teams sides (No teams can go anywhere...)
                var team = LocalPlayerEntities.Instance.LocalPlayerController.NetworkedTeamComp.MyTeam;
                if (team == NetworkedTeam.Team.NoTeam ||
                    (team == NetworkedTeam.Team.TeamA && dest.z < -1f) ||
                    (team == NetworkedTeam.Team.TeamB && dest.z > 1f))
                {
                    PlayerMovement.Instance.MoveTo(dest);
                    m_gloveNetworking.OnZip(dest);
                }
            }

            m_flyingBack = true;
        }

        public void OnHitObstacle()
        {
            m_flyingBack = true;
        }

        public static void SetRootRotation(Transform root, GloveSide side, bool withScale = false)
        {
            root.localRotation = side == GloveSide.Left
                ? Quaternion.Euler(0, 90, 180)
                : Quaternion.Euler(0, -90, 0);

            if (withScale)
            {
                root.localScale = side == GloveSide.Left
                    ? new Vector3(-1, 1, 1)
                    : Vector3.one;
            }
        }
    }
}