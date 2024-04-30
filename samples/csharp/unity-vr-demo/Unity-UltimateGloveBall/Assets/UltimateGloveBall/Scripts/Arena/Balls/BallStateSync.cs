// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System;
using System.Collections.Generic;
using System.Linq;
using UltimateGloveBall.Arena.Player;
using Unity.Netcode;
using UnityEngine;
using UnityEngine.Assertions;

namespace UltimateGloveBall.Arena.Balls
{
    /// <summary>
    /// This class handles synchronization of the ball position. We synchronize the balls using rpcs, each packet
    /// contains the necessary information to keep the ball aligned on all clients. The clients simulate their own
    /// physics and readjust based on the packets information. It also handles attaching a ball to a glove when a player
    /// handles the ball to keep the visual in sync between the ball and the glove for all players.
    /// We can set the update rate and smoothing factors.
    /// </summary>
    [RequireComponent(typeof(BallNetworking))]
    [RequireComponent(typeof(Rigidbody))]
    public class BallStateSync : NetworkBehaviour
    {
        #region State & Packet

        /// <summary>
        /// A state update for a typical Unity Rigidbody with control for syncing velocities or not.
        /// </summary>
        private struct BallStateUpdate : INetworkSerializable
        {
            public bool IsGrabbed;                                   // Ball is grabbed on the server
            public ulong GrabbersNetworkObjectId;                     // Ball is grabbed by an object with this network Id
            public Vector3 Position;                                  // Server position of the ball
            public Quaternion Orientation;                            // Server orientation of the ball

            public bool SyncVelocity;                                  // Server is syncing velocities
            public Vector3 LinearVelocity;                             // Server linear velocity of the ball
            public Vector3 AngularVelocity;                            // Server angular velocity of the ball

            public void NetworkSerialize<T>(BufferSerializer<T> serializer) where T : IReaderWriter
            {
                serializer.SerializeValue(ref IsGrabbed);

                // Serialize network Id of grabber only if grabbed
                if (IsGrabbed)
                    serializer.SerializeValue(ref GrabbersNetworkObjectId);

                serializer.SerializeValue(ref Position);
                serializer.SerializeValue(ref Orientation);
                serializer.SerializeValue(ref SyncVelocity);

                // Serialize velocity only if balls are moving
                if (!SyncVelocity) return;

                serializer.SerializeValue(ref LinearVelocity);
                serializer.SerializeValue(ref AngularVelocity);
            }
        }

        /// <summary>
        ///     The ball packet includes a sequence number which correlates to when the server sent the packet and the status update of the networked ball.
        /// </summary>
        private struct BallPacket : INetworkSerializable
        {
            // The sequence number of the packet (usually frame count when package is sent)
            public uint Sequence;

            // The ball state for this packet
            public BallStateUpdate StateUpdate;

            public void NetworkSerialize<T>(BufferSerializer<T> serializer) where T : IReaderWriter
            {
                serializer.SerializeValue(ref Sequence);
                serializer.SerializeValue(ref StateUpdate);
            }
        }

        #endregion

        public event Action DetectedBallShotFromServer;


        #region Fields

        [Header("Synchronization")]
        [Tooltip("This value determines how often the server sends updates. The update rate is per FixedUpdate.")]
        [SerializeField] private uint m_updateRate = 25;

        [Tooltip("This value determines how often a client will flush its jitter buffer. The update rate is per FixedUpdate.")]
        [SerializeField] private uint m_bufferFlushRate = 4;

        [Header("Smoothing")]
        [Tooltip("This factor determines the smoothness of position lerp.")]
        [SerializeField, Range(0, 1)] private float m_smoothingFactorPosition = 0.75f;

        [Tooltip("This factor determines the smoothness of rotation slerp")]
        [SerializeField, Range(0, 1)] private float m_smoothingFactorRotation = 0.1f;

        [Tooltip("This factor determines the smoothness of velocity lerp")]
        [SerializeField, Range(0, 1)] private float m_smoothingFactorVelocity = 0.95f;

        [Tooltip("This value determines what the error will be before the ball is snapped to the correct position.")]
        [SerializeField] private float m_errorSnapThresholdInMeters = 5;

        private uint m_frameCount;      // Current frame count. This is not synced with other clients and is only used for local logic.

        private readonly List<BallPacket> m_jitterBuffer = new();        // We use a jitter buffer to ensure that any packages received are applied in order. 


        private NetworkObject m_currentGrabber;          // The ball is currently networked to this object. When this is null the ball is free.

        private bool m_ballWasThrownLocally;            // This should become true if this client is the one that threw the ball
        private bool m_sendPackets = true;              // Change this to control when server should send packets and not.
        private bool m_ballIsDead;                      // This boolean should be used to eventually disable sending packets.
        private uint m_latestSequenceNumber;      // Storing the latest applied package number so we dont apply old packages.
        private bool m_updateImmediately;       // When the ball is shot we want to update immediately no matter our update frequency to make sure everyone quickly receives the first speed update.

        private Rigidbody m_rigidbody;
        private BallNetworking m_ball;

        private bool m_velocitySynced = false;
        private bool m_processImmediate = false;

        #endregion

        #region Lifecycle

        private void Awake()
        {
            m_rigidbody = GetComponent<Rigidbody>();
            Assert.IsNotNull(m_rigidbody, $"Could not find script of type {typeof(Rigidbody)}");

            m_ball = GetComponent<BallNetworking>();
            Assert.IsNotNull(m_ball, $"Could not find script of type {typeof(BallNetworking)}");
        }

        private void OnEnable()
        {
            m_ball.BallWasThrownLocally += OnBallThrownLocally;
            m_ball.BallDied += OnBallDied;
            m_ball.BallShotFromServer += OnServerShotBall;
        }



        private void OnDisable()
        {
            m_ball.BallWasThrownLocally -= OnBallThrownLocally;
            m_ball.BallDied -= OnBallDied;
            m_ball.BallShotFromServer -= OnServerShotBall;
        }

        public void FixedUpdate()
        {
            if (IsServer && m_sendPackets)   // Only server sends packets as long as they should
            {
                if (m_frameCount % m_updateRate == 0 || m_updateImmediately)          // We send packets with a given frequency, but sometimes we override this to send packets right away.
                {
                    SendPacket();

                    // We send the last packet after the ball has been set to dead in case ball becomes dead before first packet is sent
                    if (m_ballIsDead)
                        m_sendPackets = false;

                }
            }
            else if (!IsServer) // All clients will apply packets
            {
                if (m_frameCount % m_bufferFlushRate == 0 || m_processImmediate)     // We flush the jitter buffer with a given flush frequency
                {
                    for (var i = 0; i < m_jitterBuffer.Count; i++)
                    {
                        var packet = GetFirstPacket();       // We make sure to apply the packages in the buffer in the correct order
                        ApplyPacket(GetFirstPacket());
                        _ = m_jitterBuffer.Remove(packet);
                        m_latestSequenceNumber = packet.Sequence;     // Update the latest sequence number from the server.
                    }
                }
            }

            m_frameCount++;
        }

        #endregion

        #region Private Methods

        /// <summary>
        ///     Used to both create and send packets with transform and rigidbody status.
        /// </summary>
        private void SendPacket()
        {
            var ballTransform = transform;
            var grabber = m_ball.CurrentGrabber;

            var velocity = m_rigidbody.velocity;
            var update = new BallStateUpdate()
            {
                IsGrabbed = grabber != null,
                GrabbersNetworkObjectId = grabber == null ? uint.MaxValue : grabber.GetComponent<NetworkObject>().NetworkObjectId,       // TODO: Getting the object id could be optimized
                Position = ballTransform.position,
                Orientation = ballTransform.rotation,
                SyncVelocity = grabber == null && velocity.magnitude > 0.01f,    // Only sync velocities if ball is not at rest and not grabbed
                LinearVelocity = velocity,
                AngularVelocity = m_rigidbody.angularVelocity
            };

            if (update.SyncVelocity)
                m_updateImmediately = false;    // We make sure to not continue with immediate updates once a package with velocity data has been sent.


            var packet = CreatePacket(m_frameCount, update);

            m_latestSequenceNumber = m_frameCount;

            SendPacketClientRpc(packet);
        }

        /// <summary>
        ///     Apply incoming status updates. Also applies lerp  on position and velocity as well as slerp on rotation.
        ///     What data is applied and not depends on the ball being grabbed or not.
        /// </summary>
        /// <param name="packet"></param>
        private void ApplyPacket(BallPacket packet)
        {
            var update = packet.StateUpdate;

            if (update.IsGrabbed)            // If the ball is grabbed disable physics
            {
                if (m_currentGrabber != null && m_currentGrabber.NetworkObjectId == update.GrabbersNetworkObjectId) return;      // If we are correctly grabbed we do nothing

                m_currentGrabber = GetNetworkObject(update.GrabbersNetworkObjectId);

                if (!IsOwner)       // Disable physics and set follow transform if we are not the server or owner. They will do this separately.
                {
                    m_currentGrabber.GetComponent<Glove>().SetCurrentBall(m_ball);         // Make the ball follow the glove
                    var t = transform;
                    m_ball.EnablePhysics(false);
                    t.localPosition = update.Position;
                    t.localRotation = update.Orientation;
                    m_rigidbody.position = t.position;
                    m_rigidbody.rotation = t.rotation;
                }

                m_velocitySynced = false;
            }
            else
            {
                if (m_currentGrabber != null)        // If we are still grabbing we must first stop following before continuing
                {
                    if (!update.SyncVelocity) return;     // We're waiting for the ball to start moving

                    if (!m_ballWasThrownLocally)        // If we did not throw the ball we do a hard snap to the current state instead of lerping.
                    {
                        m_currentGrabber.GetComponent<Glove>().SetCurrentBall(null);        // Release this ball from the glove
                        m_ball.EnablePhysics(true);
                        m_rigidbody.position = update.Position;
                        m_rigidbody.rotation = update.Orientation;
                        m_rigidbody.velocity = update.LinearVelocity;
                        m_rigidbody.angularVelocity = update.AngularVelocity;
                        m_velocitySynced = true;
                    }
                    else
                    {
                        m_velocitySynced = true;               // we set this since velocity is set by player
                        m_ballWasThrownLocally = false;     // Reset this value if we threw the ball
                    }

                    m_currentGrabber = null;


                    DetectedBallShotFromServer?.Invoke();
                }

                if (!m_velocitySynced)
                {
                    if (!m_ballWasThrownLocally) // If we did not throw the ball we do a hard snap to the current state instead of lerping.
                    {
                        if (update.SyncVelocity) // We're waiting for the ball to start moving
                        {
                            m_ball.EnablePhysics(true);
                            m_rigidbody.position = update.Position;
                            m_rigidbody.rotation = update.Orientation;
                            m_rigidbody.velocity = update.LinearVelocity;
                            m_rigidbody.angularVelocity = update.AngularVelocity;
                            m_velocitySynced = true;
                            DetectedBallShotFromServer?.Invoke();
                        }
                    }
                    else
                    {
                        m_ballWasThrownLocally = false; // Reset this value if we threw the ball
                    }
                }

                #region Position & Rotation

                var targetPosition = update.Position;
                var targetRotation = update.Orientation;

                var positionError = targetPosition - transform.position;

                positionError *= m_smoothingFactorPosition;

                // If ball is way off target we teleport the ball back to correct position.
                if (positionError.magnitude > m_errorSnapThresholdInMeters)
                    m_rigidbody.position = targetPosition;
                else
                    m_rigidbody.MovePosition(Vector3.Lerp(transform.position, targetPosition - positionError, Time.fixedDeltaTime));

                var rotationError = Quaternion.Slerp(targetRotation * Quaternion.Inverse(transform.rotation), Quaternion.identity, m_smoothingFactorRotation);

                m_rigidbody.MoveRotation(targetRotation * rotationError);

                #endregion

                // If package did not send velocity we can assume the ball is stationary and set velocities to zero.
                if (update.SyncVelocity)
                {
                    #region Linear Velocity

                    // Introduced this check to battle the sharp change in velocity that results from crashing
                    // into a wall. If ball hits something and changes direction we don't apply velocity until
                    // they are aligned again.
                    if (Vector3.Dot(m_rigidbody.velocity, update.LinearVelocity) > 0f)
                    {
                        var currentVelocity = m_rigidbody.velocity;
                        var targetVelocity = update.LinearVelocity;

                        var velocityError = targetVelocity - currentVelocity;

                        velocityError *= m_smoothingFactorVelocity;

                        m_rigidbody.velocity = Vector3.Lerp(currentVelocity, targetVelocity - velocityError, Time.fixedDeltaTime);
                    }

                    #endregion

                    #region Angular Velocity

                    m_rigidbody.angularVelocity = update.AngularVelocity;

                    #endregion
                }
                else
                {
                    m_rigidbody.velocity = Vector3.zero;
                    m_rigidbody.angularVelocity = Vector3.zero;
                }
            }
        }

        /// <summary>
        ///     Returns the packet with the lowest value sequence number in the jitter buffer.
        /// </summary>
        /// <returns></returns>
        private BallPacket GetFirstPacket()
        {
            var firstFrame = m_jitterBuffer.Min(v => v.Sequence);
            return m_jitterBuffer.Single(s => s.Sequence == firstFrame);
        }

        private BallPacket CreatePacket(uint sequenceNumber, BallStateUpdate stateUpdate)
        {
            return new BallPacket()
            {
                Sequence = sequenceNumber,
                StateUpdate = stateUpdate
            };
        }

        #endregion

        #region Callbacks

        private void OnBallThrownLocally()
        {
            m_ballWasThrownLocally = true;
        }

        private void OnBallDied(BallNetworking ballNetworking, bool dieInstantly)
        {
            m_ballIsDead = true;
        }

        /// <summary>
        ///     When the server has shot the ball we control the immediate update bool in this callback.
        /// </summary>
        private void OnServerShotBall()
        {
            m_updateImmediately = true;
        }

        #endregion

        #region RPCs

        [ClientRpc]
        private void SendPacketClientRpc(BallPacket packet)
        {
            if (IsServer) return;       // Server sends packets based on local physics and should never apply incoming packages

            // If we receive a packet which is older than our latest applied package we disregard it.
            if (packet.Sequence <= m_latestSequenceNumber)
            {
                if (packet.Sequence == 0 && m_jitterBuffer.Count == 0)
                {
                    m_processImmediate = true;
                }
                else
                {
                    return;
                }
            }

            if (m_jitterBuffer.Count == 64)     // If the jitter buffer fills up we start removing the oldest packets
                m_jitterBuffer.RemoveAt(0);

            m_jitterBuffer.Add(packet);
        }

        #endregion

        public void Reset()
        {
            // Release ball if we were holding it from state update
            if (m_currentGrabber != null)
            {
                var glove = m_currentGrabber.GetComponent<Glove>();
                if (glove.CurrentBall.gameObject == gameObject)
                {
                    glove.SetCurrentBall(null);
                }
            }
            // Reset all variables
            m_jitterBuffer.Clear();
            m_ballWasThrownLocally = false;
            m_ballIsDead = false;
            m_updateImmediately = false;
            m_processImmediate = false;
            m_currentGrabber = null;
            m_sendPackets = true;
            m_latestSequenceNumber = 0;
            m_frameCount = 0;
            m_velocitySynced = false;
        }
    }
}
