// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System.Collections;
using System.Collections.Generic;
using Meta.Utilities;
using UltimateGloveBall.Arena.Gameplay;
using UltimateGloveBall.Arena.Player.Respawning;
using UltimateGloveBall.Arena.Services;
using Unity.Netcode;
using UnityEngine;
using Object = UnityEngine.Object;

namespace UltimateGloveBall.Arena.Player
{
    /// <summary>
    /// Controls the player state. Handles the state of the shield, the invulnerability, team state and reference the
    /// respawn controller.
    /// </summary>
    public class PlayerControllerNetwork : NetworkBehaviour
    {
        private const float SHIELD_USAGE_RATE = 20f;
        private const float SHIELD_CHARGE_RATE = 32f;
        private const float SHIELD_MAX_CHARGE = 100f;
        private const float SHIELD_RESET_TIME = 0.5f;

        [SerializeField] private Collider m_collider;
        [SerializeField] private PlayerAvatarEntity m_avatar;
        [SerializeField, AutoSet] private NetworkedTeam m_networkedTeam;
        [SerializeField, AutoSet] private RespawnController m_respawnController;

        private bool m_shieldActivated = false;
        private Glove.GloveSide m_shieldSide = Glove.GloveSide.Left;

        public GloveArmatureNetworking ArmatureRight;
        public GloveArmatureNetworking ArmatureLeft;

        public GloveNetworking GloveRight;
        public GloveNetworking GloveLeft;

        private NetworkVariable<float> m_shieldCharge = new(SHIELD_MAX_CHARGE);

        private NetworkVariable<float> m_shieldOffTimer = new();
        private NetworkVariable<bool> m_shieldInResetMode = new(false);
        private NetworkVariable<bool> m_shieldDisabled = new(false);

        public NetworkVariable<bool> IsInvulnerable = new();
        private readonly HashSet<Object> m_invulnerabilityActors = new();

        public NetworkedTeam NetworkedTeamComp => m_networkedTeam;
        public RespawnController RespawnController => m_respawnController;

        public override void OnNetworkSpawn()
        {
            enabled = IsServer;
            if (IsOwner)
            {
                LocalPlayerEntities.Instance.LocalPlayerController = this;
            }
            else
            {
                LocalPlayerEntities.Instance.GetPlayerObjects(OwnerClientId).PlayerController = this;
            }

            IsInvulnerable.OnValueChanged += OnInvulnerabilityStateChanged;
            OnInvulnerabilityStateChanged(IsInvulnerable.Value, IsInvulnerable.Value);
        }

        public void SetInvulnerability(Object setter)
        {
            if (IsServer)
            {
                _ = m_invulnerabilityActors.Add(setter);
                if (!IsInvulnerable.Value)
                {
                    IsInvulnerable.Value = true;
                }
            }
        }

        public void RemoveInvulnerability(Object setter)
        {
            if (IsServer)
            {
                _ = m_invulnerabilityActors.Remove(setter);
                if (IsInvulnerable.Value && m_invulnerabilityActors.Count == 0)
                {
                    IsInvulnerable.Value = false;
                }
            }
        }

        public void ClearInvulnerability()
        {
            if (IsServer)
            {
                m_invulnerabilityActors.Clear();
                IsInvulnerable.Value = false;
            }
        }

        private void OnInvulnerabilityStateChanged(bool previousValue, bool newValue)
        {
            m_collider.enabled = !newValue;
            _ = StartCoroutine(SetAvatarState());
        }

        private IEnumerator SetAvatarState()
        {
            if (!m_avatar.IsSkeletonReady)
            {
                yield return new WaitUntil(() => m_avatar.IsSkeletonReady);
            }


            var material = m_avatar.Material;
            material.SetKeyword("ENABLE_GHOST_EFFECT", IsInvulnerable.Value);
            m_avatar.ApplyMaterial();

            ArmatureLeft.SetGhostEffect(IsInvulnerable.Value);
            ArmatureRight.SetGhostEffect(IsInvulnerable.Value);

            GloveLeft.SetGhostEffect(IsInvulnerable.Value);
            GloveRight.SetGhostEffect(IsInvulnerable.Value);
        }

        public void TriggerShield(Glove.GloveSide side)
        {
            if (m_shieldDisabled.Value)
            {
                if (side == Glove.GloveSide.Right)
                {
                    ArmatureRight.OnShieldNotAvailable();
                }
                else
                {
                    ArmatureLeft.OnShieldNotAvailable();
                }
            }
            else
            {
                TriggerShieldServerRPC(side);
            }
        }

        public void OnShieldHit(Glove.GloveSide side)
        {
            m_shieldCharge.Value = 0;
            StopShield(side);
            m_shieldInResetMode.Value = true;
            m_shieldDisabled.Value = true;
            ArmatureLeft.DisableShield();
            ArmatureRight.DisableShield();
            ArmatureLeft.ShieldChargeLevel = m_shieldCharge.Value;
            ArmatureRight.ShieldChargeLevel = m_shieldCharge.Value;
        }

        [ServerRpc]
        public void TriggerShieldServerRPC(Glove.GloveSide side)
        {
            if (m_shieldActivated)
            {
                if (m_shieldSide == side)
                {
                    return;
                }
                // We are switching sides, deactivate current side first
                {
                    if (m_shieldSide == Glove.GloveSide.Right)
                    {
                        ArmatureRight.DeactivateShield();
                    }
                    else
                    {
                        ArmatureLeft.DeactivateShield();
                    }
                }
            }

            m_shieldActivated = true;
            m_shieldSide = side;

            if (m_shieldSide == Glove.GloveSide.Right)
            {
                ArmatureRight.ActivateShield();
            }
            else
            {
                ArmatureLeft.ActivateShield();
            }
        }

        [ServerRpc]
        public void StopShieldServerRPC(Glove.GloveSide side)
        {
            StopShield(side);
        }

        private void StopShield(Glove.GloveSide side)
        {
            if (!IsServer)
            {
                return;
            }

            if (!m_shieldActivated || side != m_shieldSide)
            {
                return;
            }

            m_shieldActivated = false;

            if (m_shieldSide == Glove.GloveSide.Right)
            {
                ArmatureRight.DeactivateShield();
            }
            else
            {
                ArmatureLeft.DeactivateShield();
            }
        }

        private void Update()
        {
            if (!IsServer)
            {
                return;
            }

            if (m_shieldActivated)
            {
                m_shieldCharge.Value -= SHIELD_USAGE_RATE * Time.deltaTime;
                if (m_shieldCharge.Value <= 0)
                {
                    m_shieldCharge.Value = 0;
                    StopShield(m_shieldSide);
                    m_shieldInResetMode.Value = true;
                    m_shieldDisabled.Value = true;
                    ArmatureLeft.DisableShield();
                    ArmatureRight.DisableShield();
                }

                ArmatureLeft.ShieldChargeLevel = m_shieldCharge.Value;
                ArmatureRight.ShieldChargeLevel = m_shieldCharge.Value;
            }
            else if (m_shieldInResetMode.Value)
            {
                m_shieldOffTimer.Value += Time.deltaTime;
                if (m_shieldOffTimer.Value >= SHIELD_RESET_TIME)
                {
                    m_shieldOffTimer.Value = 0;
                    m_shieldInResetMode.Value = false;
                }
            }
            else if (m_shieldCharge.Value < SHIELD_MAX_CHARGE)
            {
                m_shieldCharge.Value += SHIELD_CHARGE_RATE * Time.deltaTime;
                if (m_shieldCharge.Value >= SHIELD_MAX_CHARGE)
                {
                    m_shieldCharge.Value = SHIELD_MAX_CHARGE;
                    if (m_shieldDisabled.Value)
                    {
                        m_shieldDisabled.Value = false;
                        ArmatureLeft.EnableShield();
                        ArmatureRight.EnableShield();
                    }
                }
                ArmatureLeft.ShieldChargeLevel = m_shieldCharge.Value;
                ArmatureRight.ShieldChargeLevel = m_shieldCharge.Value;
            }
        }
    }
}
