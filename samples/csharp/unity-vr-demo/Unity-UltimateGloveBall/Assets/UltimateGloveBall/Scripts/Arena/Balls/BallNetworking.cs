// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System;
using System.Collections.Generic;
using System.Linq;
using Meta.Utilities;
using UltimateGloveBall.Arena.Environment;
using UltimateGloveBall.Arena.Gameplay;
using UltimateGloveBall.Arena.Player;
using UltimateGloveBall.Arena.Player.Respawning;
using UltimateGloveBall.Arena.VFX;
using UltimateGloveBall.Design;
using Unity.Netcode;
using UnityEngine;
using Vector3 = UnityEngine.Vector3;

namespace UltimateGloveBall.Arena.Balls
{
    /// <summary>
    /// Handles the network state of the ball as well as the game logic. This is the core of the ball behaviour,
    /// it handles throwing, ownership changes, audio on collision, vfx on collision, enabling and disabling the
    /// physics. Updating score and knocking out players.
    /// It has event that works with the BallStateSync class to keep the ball position synchronized between players.
    /// </summary>
    public class BallNetworking : NetworkBehaviour
    {
        public event Action BallWasThrownLocally;
        public event Action<BallNetworking, bool> BallDied;
        public event Action BallShotFromServer;
        public event Action<float> OnBallShot;
        public event Action<ulong, ulong> OnOwnerChanged;
        [SerializeField, AutoSet] private Rigidbody m_rigidbody;
        [SerializeField, AutoSet] private BallStateSync m_stateSync;
        [SerializeField] private BallData m_ballData;
        [SerializeField] private BallAudio m_ballAudio;
        [SerializeField] private AudioClip m_onThrownAudioClip;

        [SerializeField] private List<MeshRenderer> m_ballRenderers;
        [SerializeField] private Material m_deadMaterial;
        [SerializeField] private AudioSource m_audioSource;

        [SerializeField] private BallSpinVisual m_ballSpinVisual;

        [SerializeField, AutoSet] private BallBehaviour m_ballBehaviour;

        private NetworkVariable<ulong> m_owner = new(ulong.MaxValue);

        private NetworkVariable<bool> m_isOnSpawnerState = new(true);
        private ulong m_throwOwnerClientId = ulong.MaxValue;

        private bool
            m_ballIsDead; // When this is true our ball is officially killed and should no longer be able to be picked up or interact with objects

        private bool
            m_killBallOnNextCollision; // This should be true once we have detected that a ball has been shot from the server.

        private Material
            m_defaultMaterial; // Default material is picked from the first indexed ball mesh renderer's material.

        private Glove m_lastGrabber;

        public bool HasOwner => m_owner.Value != ulong.MaxValue;

        public NetworkedTeam.Team ThrownTeam { get; private set; } = NetworkedTeam.Team.NoTeam;

        public bool IsAlive => !m_ballIsDead;

        public Glove CurrentGrabber { get; private set; } // Current grabber that holds the ball.

        public BallBehaviour BallBehaviour => m_ballBehaviour;


        public override void OnNetworkSpawn()
        {
            m_owner.OnValueChanged += OnOwnershipUpdated;
            m_isOnSpawnerState.OnValueChanged += OnSpawnerStateChanged;

            OnOwnershipUpdated(m_owner.Value, m_owner.Value);
            OnSpawnerStateChanged(m_isOnSpawnerState.Value, m_isOnSpawnerState.Value);
        }

        private void OnSpawnerStateChanged(bool previousvalue, bool newvalue)
        {
            if (newvalue)
            {
                gameObject.SetLayerToChilds(ObjectLayers.SPAWN_BALL);
                m_ballSpinVisual.SetState(BallSpinVisual.SpinState.Spawned);
            }
            else
            {
                m_ballSpinVisual.SetState(BallSpinVisual.SpinState.Holding);
                if (gameObject.GetComponent<ElectricBall>() != null)
                {
                    gameObject.SetLayerToChilds(ObjectLayers.FIRE_BALL);
                }
                else
                {
                    gameObject.SetLayerToChilds(ObjectLayers.BALL);
                }
            }
        }

        private void Awake()
        {
            m_ballSpinVisual.Init(m_ballData);
            m_defaultMaterial = m_ballRenderers[0].sharedMaterial;
        }

        private void OnEnable()
        {
            m_stateSync.DetectedBallShotFromServer += FromDetectedBallShotFromServer;
        }

        private void FromDetectedBallShotFromServer()
        {
            m_killBallOnNextCollision = true;
        }

        private void OnDisable()
        {
            m_stateSync.DetectedBallShotFromServer -= FromDetectedBallShotFromServer;
            ResetBall();
        }

        private void FixedUpdate()
        {
            // Lock the rigidbody in place when velocity becomes low
            if (IsOwner && m_rigidbody.velocity.magnitude < 0.1f)
            {
                m_rigidbody.velocity = Vector3.zero;
                m_rigidbody.angularVelocity = Vector3.zero;
            }

            if (m_ballIsDead || !(transform.position.y < -1)) return;

            KillBall(true);
        }

        private void OnCollisionEnter(Collision collision)
        {
            if (m_ballIsDead)
            {
                m_audioSource.PlayOneShot(m_ballAudio.BallBounceClip);
                return;
            }

            m_ballSpinVisual.SetState(BallSpinVisual.SpinState.Hit);
            var isHitSfxPlayed = false;

            // Process Collision SFX and VFX
            var go = collision.gameObject;
            if (!HasOwner && go.GetComponent<Obstacle>() != null)
            {
                m_audioSource.PlayOneShot(m_ballAudio.BallBounceClip);
                isHitSfxPlayed = true;
                var contact = collision.GetContact(0);
                var hitPos = collision.collider.ClosestPointOnBounds(contact.point);
                VFXManager.Instance.PlayHitVFX(hitPos, contact.normal);
            }
            else if (!HasOwner && go.GetComponent<Shield>() != null)
            {
                m_audioSource.PlayOneShot(m_ballAudio.BallHitShieldClip);
                isHitSfxPlayed = true;
                var contact = collision.GetContact(0);
                VFXManager.Instance.PlayHitVFX(contact.point, contact.normal);
            }

            var hitPlayer = go.TryGetComponent<NetworkedTeam>(out var teamComp);
            if (hitPlayer)
            {
                m_audioSource.PlayOneShot(m_ballAudio.BallHitClip);
                isHitSfxPlayed = true;
                var contact = collision.GetContact(0);
                VFXManager.Instance.PlayHitVFX(contact.point, contact.normal);
            }

            if (!isHitSfxPlayed)
            {
                m_audioSource.PlayOneShot(m_ballAudio.BallBounceClip);
            }

            if (!IsServer)
            {
                if (m_killBallOnNextCollision)
                {
                    KillBall(false);
                }

                return;
            }

            if (ThrownTeam == NetworkedTeam.Team.NoTeam)
            {
                return;
            }

            // hit player
            if (hitPlayer)
            {
                if (teamComp.MyTeam != ThrownTeam)
                {
                    GameState.Instance.Score.UpdateScore(ThrownTeam, 1);
                    go.GetComponent<RespawnController>().KnockOutPlayer();
                }
            }

            // When ball has collided we kill it on the server
            KillBall(true);


            ThrownTeam = NetworkedTeam.Team.NoTeam;
        }

        private void OnOwnershipUpdated(ulong previousValue, ulong newValue)
        {
            if (IsOwner && m_lastGrabber != null && newValue == OwnerClientId)
            {
                // If a grab was allowed by server we can update the grabbers and assign this ball to our grabber.
                CurrentGrabber = m_lastGrabber;
                CurrentGrabber.AssignBall(this);
                m_lastGrabber = null;
            }

            if (previousValue != newValue && newValue != ulong.MaxValue)
            {
                m_audioSource.PlayOneShot(m_ballAudio.BallGrabbedClip);
            }

            OnOwnerChanged?.Invoke(previousValue, newValue);
        }

        /// <summary>
        ///     Call this to reset all states, local and networked.
        /// </summary>
        public void ResetBall()
        {
            m_stateSync.Reset(); // Make sure the state syncing is reset as well

            if (CurrentGrabber != null &&
                CurrentGrabber.CurrentBall ==
                this) // If we for any reason should have a grabber we make sure it unassign this ball
                CurrentGrabber.SetCurrentBall(null);

            CurrentGrabber = null;

            // Reset all local data, physics and visuals
            m_ballIsDead = false;
            m_killBallOnNextCollision = false;
            ThrownTeam = NetworkedTeam.Team.NoTeam;
            m_throwOwnerClientId = ulong.MaxValue;
            m_lastGrabber = null;
            EnablePhysics(false);
            UpdateVisuals(false);

            if (m_ballBehaviour != null)
            {
                m_ballBehaviour.ResetBall();
            }
        }

        public void SetSpawnState(bool onSpawner)
        {
            m_isOnSpawnerState.Value = onSpawner;
            ResetOwner();
        }

        public void TryGrabBall(Glove grabber)
        {
            if (m_ballIsDead) return;

            if (grabber.HasBall) // If the glove already has a ball we do not try to grab another one.
                return;

            m_lastGrabber = grabber;
            TakeOwnershipServerRpc(NetworkManager.LocalClientId);
        }

        public void Drop()
        {
            DropBallServerRpc(transform.position);
        }

        public void Throw(Vector3 direction, float chargeUpPct)
        {
            var ballPositionOnThrow = transform.position;
            BallWasThrownLocally?.Invoke();

            CurrentGrabber.SetCurrentBall(null); // MAke the grabber release the ball
            CurrentGrabber = null;
            ThrowServerRpc(ballPositionOnThrow, direction, chargeUpPct);

            m_ballSpinVisual.SetState(BallSpinVisual.SpinState.Thrown, chargeUpPct);
            m_throwOwnerClientId = m_owner.Value;
            m_audioSource.PlayOneShot(m_onThrownAudioClip);

            // Anyone but server will shoot immediately and catch up with server packets. Server shoots in above Throw-RPC
            if (!IsServer)
                ShootBall(ballPositionOnThrow, direction, chargeUpPct);
        }

        // This is for balls that are spawned mid air
        public void LaunchBall(Vector3 direction, NetworkedTeam.Team team, float chargeUpPct)
        {
            if (!IsServer) return;

            m_isOnSpawnerState.Value = false;
            ThrownTeam = team;
            BallWasThrownLocally?.Invoke();
            ShootBall(transform.position, direction, chargeUpPct);
            BallShotFromServer?.Invoke();
        }

        private void ResetOwner()
        {
            m_owner.Value = ulong.MaxValue;
        }

        [ServerRpc(RequireOwnership = false)]
        private void DropBallServerRpc(Vector3 origin)
        {
            var thrower = NetworkManager.Singleton.SpawnManager.GetPlayerNetworkObject(m_owner.Value);
            ThrownTeam = thrower.TryGetComponent<NetworkedTeam>(out var team) ? team.MyTeam : NetworkedTeam.Team.NoTeam;

            NetworkObject.ChangeOwnership(NetworkManager.ServerClientId);
            ResetOwner();
            // Release the ball from following the previous grabber
            CurrentGrabber.SetCurrentBall(null);
            CurrentGrabber = null;

            var ballTransform = transform;
            ballTransform.SetParent(null);

            // drop here
            ballTransform.position = origin;
            transform.forward = Vector3.down;
            EnablePhysics(true);
            m_rigidbody.velocity = Vector3.zero;
            m_rigidbody.angularVelocity = Vector3.zero;

            BallShotFromServer?.Invoke();
        }

        [ServerRpc(RequireOwnership = false)]
        private void ThrowServerRpc(Vector3 origin, Vector3 direction, float chargeUpPct)
        {
            var thrower = NetworkManager.Singleton.SpawnManager.GetPlayerNetworkObject(m_owner.Value);

            if (thrower == null)
            {
                Debug.LogWarning(
                    $"Ball was thrown but no network object was found for owner. Owner ID: {m_owner.Value}");
                return;
            }

            if (thrower.TryGetComponent<NetworkedTeam>(out var team))
                ThrownTeam = team.MyTeam;
            else
                Debug.LogWarning($"Ball was thrown but no team was found on the owner. Owner ID: {m_owner.Value}");

            // give back to server
            NetworkObject.ChangeOwnership(NetworkManager.ServerClientId);
            ResetOwner();
            // Release the ball from following the previous grabber
            if (CurrentGrabber != null)
            {
                CurrentGrabber.SetCurrentBall(null);
                CurrentGrabber = null;
            }

            ShootBall(origin, direction, chargeUpPct);

            BallShotFromServer?.Invoke();
        }

        private void ShootBall(Vector3 origin, Vector3 direction, float chargeUpPct)
        {
            // throw the ball in the desired direction
            var ballTransform = transform;
            ballTransform.position = origin;
            ballTransform.forward = direction;
            EnablePhysics(true);
            m_rigidbody.angularVelocity = Vector3.zero;
            var ballForce = Mathf.Lerp(m_ballData.MinThrowSpeed, m_ballData.MaxThrowSpeed, chargeUpPct);
            m_rigidbody.velocity = direction.normalized * ballForce;
            OnBallShot?.Invoke(chargeUpPct);
            if (IsServer)
            {
                OnBallShotClientRPC(chargeUpPct);
            }
        }

        [ClientRpc]
        private void OnBallShotClientRPC(float chargeUpPct)
        {
            m_ballSpinVisual.SetState(BallSpinVisual.SpinState.Thrown, chargeUpPct);

            if (m_throwOwnerClientId != NetworkManager.Singleton.LocalClientId)
            {
                m_audioSource.PlayOneShot(m_onThrownAudioClip);
            }
        }

        [ServerRpc(RequireOwnership = false)]
        private void TakeOwnershipServerRpc(ulong clientId)
        {
            if (m_ballIsDead) return;
            if (HasOwner) return;

            if (NetworkManager.ConnectedClients.TryGetValue(clientId, out var client))
            {
                var gloves = client.OwnedObjects.Where(o => o.name.Contains("GloveHand"))
                    .Select(o => o.GetComponent<GloveNetworking>())
                    .ToList();
                if (gloves.Count > 0)
                {
                    var sqrDist = float.MaxValue;
                    GloveNetworking grabber = null;
                    foreach (var glove in gloves)
                    {
                        var distanceToGlove = Mathf.Min(sqrDist,
                            Vector3.SqrMagnitude(glove.transform.position - transform.position));

                        if (!(distanceToGlove < sqrDist)) continue;

                        grabber = glove;
                        sqrDist = distanceToGlove;
                    }

                    if (grabber != null)
                    {
                        // The server sets the grabber and follow transform at this point
                        CurrentGrabber = grabber.GetComponent<Glove>();
                        CurrentGrabber.SetCurrentBall(this);
                        EnablePhysics(false);
                        m_rigidbody.Sleep();
                    }

                    SetSpawnState(false);

                    NetworkObject.ChangeOwnership(clientId);
                    m_owner.Value = clientId;
                }
            }
        }

        public void EnablePhysics(bool enable)
        {
            m_rigidbody.isKinematic = !enable;
            m_rigidbody.useGravity = enable;
        }

        private void UpdateVisuals(bool isDead)
        {
            foreach (var ball in m_ballRenderers)
                ball.sharedMaterial = isDead ? m_deadMaterial : m_defaultMaterial;
        }

        public void KillBall(bool announceDeath, bool dieInstantly = false)
        {
            m_ballIsDead = true;

            UpdateVisuals(true);
            if (announceDeath)
            {
                // We tell local server scripts our ball has died
                BallDied?.Invoke(this, dieInstantly);
            }
        }
    }
}