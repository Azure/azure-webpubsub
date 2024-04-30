// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using UltimateGloveBall.Arena.Services;
using Unity.Netcode;
using UnityEngine;

namespace UltimateGloveBall.Arena.Player
{
    /// <summary>
    /// Syncs glove armature state on the network.
    /// Ghost effect, shield indicator, spring state, shield state.
    /// </summary>
    public class GloveArmatureNetworking : NetworkBehaviour
    {
        private static readonly int s_ghostProperty = Shader.PropertyToID("ENABLE_GHOST_EFFECT");

        [SerializeField] private Transform m_root;
        [SerializeField] private Transform m_shieldAnchor;
        [SerializeField] private GloveSpringController m_springController;
        [SerializeField] private Shield m_shield;
        [SerializeField] private ShieldIndicator m_shieldIndicator;
        [SerializeField] private AudioSource m_shieldAudioSource;
        [SerializeField] private AudioClip m_shieldActivatedAudioClip;
        [SerializeField] private AudioClip m_shieldDeactivatedAudioClip;
        [SerializeField] private AudioClip m_shieldUnAvailableAudioClip;

        [SerializeField] public Transform ElectricTetherForHandPoint;
        [SerializeField] public LODGroup[] LODGroups;


        private NetworkVariable<Glove.GloveSide> m_side = new();
        private NetworkVariable<bool> m_activated = new(writePerm: NetworkVariableWritePermission.Owner);
        private NetworkVariable<bool> m_shieldActivated = new();
        private NetworkVariable<float> m_shieldChargedLevel = new(100);
        private NetworkVariable<bool> m_shieldDisabled = new();

        public Glove.GloveSide Side
        {
            get => m_side.Value;
            set
            {
                m_side.Value = value;
                ApplyRotationAndScale(m_side.Value, true);
            }
        }

        public float ShieldChargeLevel
        {
            get => m_shieldChargedLevel.Value;
            set => m_shieldChargedLevel.Value = value;
        }

        // [0-1] percentage 1: fully compressed 0: not compressed
        public float SpringCompression => m_springController.Compression;

        public bool Activated
        {
            get => m_activated.Value;
            set => m_activated.Value = value;
        }

        public void ActivateShield()
        {
            m_shieldActivated.Value = true;
        }

        public void DeactivateShield()
        {
            m_shieldActivated.Value = false;
        }

        public void EnableShield()
        {
            m_shieldDisabled.Value = false;
        }

        public void DisableShield()
        {
            m_shieldDisabled.Value = true;
        }

        public void OnShieldNotAvailable()
        {
            m_shieldAudioSource.PlayOneShot(m_shieldUnAvailableAudioClip);
        }

        private void Awake()
        {
            m_side.OnValueChanged += OnSideChanged;
            m_activated.OnValueChanged += OnActivated;
            m_shieldActivated.OnValueChanged += OnShieldActivated;
            m_shieldChargedLevel.OnValueChanged += OnShieldChargedLevelChanged;
            m_shieldDisabled.OnValueChanged += OnShieldDisabledChanged;
        }

        private void OnShieldChargedLevelChanged(float previousvalue, float newvalue)
        {
            UpdateShieldChargeLevel(newvalue);
        }

        private void OnShieldDisabledChanged(bool previousvalue, bool newvalue)
        {
            if (newvalue)
            {
                m_shieldIndicator.SetDisabledState();
            }
            else
            {
                m_shieldIndicator.SetEnabledState();
            }
        }

        private void OnShieldActivated(bool previousvalue, bool newvalue)
        {
            if (previousvalue != newvalue)
            {
                m_shieldAudioSource.Stop();
                m_shieldAudioSource.clip = newvalue ? m_shieldActivatedAudioClip : m_shieldDeactivatedAudioClip;
                m_shieldAudioSource.Play();
            }

            m_shield.gameObject.SetActive(newvalue);
            m_shield.UpdateChargeLevel(m_shieldChargedLevel.Value);
        }

        private void OnActivated(bool previousvalue, bool newvalue)
        {
            if (newvalue)
            {
                m_springController.Activate();
            }
            else
            {
                m_springController.Deactivate();
            }
        }


        private void OnSideChanged(Glove.GloveSide previousvalue, Glove.GloveSide newvalue)
        {
            // Orient armature properly related to the wrist
            ApplyRotationAndScale(newvalue, true);
        }

        // This will orient armature based on the wrist side
        private void ApplyRotationAndScale(Glove.GloveSide gloveSide, bool withScale)
        {
            Glove.SetRootRotation(m_root, gloveSide, withScale);
            // to avoid physics collider errors due to negative scaling
            // we apply the same scale to invert it on the shield
            m_shieldAnchor.localScale = m_root.localScale;
        }

        public override void OnNetworkSpawn()
        {
            if (IsOwner)
            {
                var playerEnts = LocalPlayerEntities.Instance;
                if (Side == Glove.GloveSide.Left)
                {
                    playerEnts.LeftGloveArmature = this;
                }
                else if (Side == Glove.GloveSide.Right)
                {
                    playerEnts.RightGloveArmature = this;
                }

                playerEnts.TryAttachGloves();
                SetLocalLoDs();
            }
            else
            {
                var playerObjects = LocalPlayerEntities.Instance.GetPlayerObjects(OwnerClientId);
                if (Side == Glove.GloveSide.Left)
                {
                    playerObjects.LeftGloveArmature = this;
                }
                else if (Side == Glove.GloveSide.Right)
                {
                    playerObjects.RightGloveArmature = this;
                }

                playerObjects.TryAttachObjects();
            }

            OnSideChanged(m_side.Value, m_side.Value);
        }

        public override void OnNetworkDespawn()
        {
            if (IsOwner)
            {
                var playerEnts = LocalPlayerEntities.Instance;
                if (Side == Glove.GloveSide.Left)
                {
                    playerEnts.LeftGloveArmature = null;
                }
                else if (Side == Glove.GloveSide.Right)
                {
                    playerEnts.RightGloveArmature = null;
                }
            }
        }

        private void UpdateShieldChargeLevel(float level)
        {
            m_shieldIndicator.UpdateChargeLevel(level);
            if (m_shield.gameObject.activeSelf)
            {
                m_shield.UpdateChargeLevel(level);
            }
        }

        private void SetLocalLoDs()
        {
            foreach (var lodGroup in LODGroups)
            {
                if (lodGroup)
                {
                    lodGroup.ForceLOD(0);
                }
            }
        }

        public void SetGhostEffect(bool enable)
        {
            foreach (var group in LODGroups)
            {
                var rends = group.transform.GetComponentsInChildren<Renderer>();

                foreach (var rend in rends)
                {
                    var material = rend.material;
                    material.SetFloat(s_ghostProperty, enable ? 1 : 0);
                }
            }
        }
    }
}
