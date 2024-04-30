// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System;
using Meta.Multiplayer.Core;
using UltimateGloveBall.App;
using UltimateGloveBall.Arena.Balls;
using UltimateGloveBall.Arena.Services;
using Unity.Netcode;
using UnityEngine;
using UnityEngine.Assertions;

namespace UltimateGloveBall.Arena.Player
{
    /// <summary>
    /// Glove network state sync.
    /// Ghost effect, zip sounds, animation state, side, flying and ball grabbed.
    /// </summary>
    [RequireComponent(typeof(Glove))]
    public class GloveNetworking : NetworkBehaviour
    {
        private static readonly int s_ghostProperty = Shader.PropertyToID("ENABLE_GHOST_EFFECT");
        private static readonly int s_grabbed = Animator.StringToHash("Grabbed");

        [SerializeField] private Transform m_root;
        [SerializeField] private Animator m_animator;
        [SerializeField] private AudioClip m_zipSound;

        public Transform BallAnchor;

        private NetworkVariable<bool> m_ballGrabbed = new(writePerm: NetworkVariableWritePermission.Owner);
        private NetworkVariable<bool> m_flying = new(writePerm: NetworkVariableWritePermission.Owner);

        private Glove m_glove;
        private NetworkVariable<Glove.GloveSide> m_side = new(writePerm: NetworkVariableWritePermission.Owner);
        private AudioSource m_zipAudioSource;

        public Action OnTryGrabBall;

        public bool Grabbed
        {
            get => m_ballGrabbed.Value;
            set
            {
                if (IsOwner)
                {
                    m_ballGrabbed.Value = value;
                }
            }
        }

        public bool Flying
        {
            get => m_flying.Value;
            set => m_flying.Value = value;
        }

        public Glove.GloveSide Side
        {
            get => m_side.Value;
            set
            {
                m_side.Value = value;
                Glove.SetRootRotation(m_root, m_side.Value, true);
            }
        }

        private void Awake()
        {
            m_glove = GetComponent<Glove>();
            Assert.IsNotNull(m_glove, $"Did not find component for {nameof(m_glove)}.");

            m_side.OnValueChanged += OnSideChanged;
            m_flying.OnValueChanged += OnFlyingStateChanged;

            m_zipAudioSource = new GameObject("ZipSound").AddComponent<AudioSource>();
            m_zipAudioSource.outputAudioMixerGroup = AudioController.Instance.SfxGroup;
            m_zipAudioSource.clip = m_zipSound;
            m_zipAudioSource.spatialize = true;
            GetComponent<ClientNetworkTransform>().IgnoreUpdates = true;
        }

        private void OnTriggerEnter(Collider other)
        {
            if (!IsOwner) return;

            if (m_glove.TriedGrabbingBall)
                return; // Do not try to grab anything if we already have detected a ball-grab

            var ballNet = other.gameObject.GetComponent<BallNetworking>();

            if (!ballNet) return;
            ballNet.TryGrabBall(m_glove);
            OnTryGrabBall?.Invoke();
        }

        private void OnFlyingStateChanged(bool previousvalue, bool newvalue)
        {
            GetComponent<ClientNetworkTransform>().IgnoreUpdates = !newvalue;
        }

        private void OnSideChanged(Glove.GloveSide previousvalue, Glove.GloveSide newvalue)
        {
            Glove.SetRootRotation(m_root, newvalue, true);
        }

        public override void OnNetworkSpawn()
        {
            if (IsOwner)
            {
                var playerEnts = LocalPlayerEntities.Instance;
                if (Side == Glove.GloveSide.Left)
                {
                    playerEnts.LeftGloveHand = GetComponent<Glove>();
                }
                else if (Side == Glove.GloveSide.Right)
                {
                    playerEnts.RightGloveHand = GetComponent<Glove>();
                }

                playerEnts.TryAttachGloves();
                m_glove.SetLODLocal();
            }
            else
            {
                var playerObjects = LocalPlayerEntities.Instance.GetPlayerObjects(OwnerClientId);
                if (Side == Glove.GloveSide.Left)
                {
                    playerObjects.LeftGloveHand = GetComponent<Glove>();
                }
                else if (Side == Glove.GloveSide.Right)
                {
                    playerObjects.RightGloveHand = GetComponent<Glove>();
                }

                playerObjects.TryAttachObjects();
            }

            OnSideChanged(m_side.Value, m_side.Value);
            m_ballGrabbed.OnValueChanged += OnGrabbedStateChanged;
            OnGrabbedStateChanged(m_ballGrabbed.Value, m_ballGrabbed.Value);
        }

        public override void OnNetworkDespawn()
        {
            if (IsOwner)
            {
                var playerEnts = LocalPlayerEntities.Instance;
                if (Side == Glove.GloveSide.Left)
                {
                    playerEnts.LeftGloveHand = null;
                }
                else if (Side == Glove.GloveSide.Right)
                {
                    playerEnts.RightGloveHand = null;
                }
            }
        }

        public void OnZip(Vector3 position)
        {
            PlayZipSound(position);
            OnZipServerRPC(position);
        }

        [ServerRpc]
        private void OnZipServerRPC(Vector3 position)
        {
            OnZipClientRPC(position);
        }

        [ClientRpc]
        private void OnZipClientRPC(Vector3 position)
        {
            if (NetworkManager.Singleton.LocalClientId != OwnerClientId)
            {
                PlayZipSound(position);
            }
        }

        private void PlayZipSound(Vector3 position)
        {
            m_zipAudioSource.transform.position = position;
            m_zipAudioSource.PlayOneShot(m_zipSound);
        }

        private void OnGrabbedStateChanged(bool previousvalue, bool newvalue)
        {
            m_animator.SetBool(s_grabbed, newvalue);
        }

        public void SetGhostEffect(bool enable)
        {
            var rends = m_glove.transform.GetComponentsInChildren<Renderer>();

            foreach (var rend in rends)
            {
                var material = rend.material;
                material.SetFloat(s_ghostProperty, enable ? 1 : 0);
            }
        }
    }
}
