// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using Meta.Utilities;
using UltimateGloveBall.App;
using UltimateGloveBall.Arena.Player.Menu;
using UltimateGloveBall.Arena.Services;
using UltimateGloveBall.Arena.Spectator;
using UltimateGloveBall.Arena.VFX;
using UnityEngine;
using UnityEngine.InputSystem;
using static UnityEngine.InputSystem.InputAction;

namespace UltimateGloveBall.Arena.Player
{
    /// <summary>
    /// Handles player inputs.
    /// Based on the state of the player it will process to the proper inputs and call the appropriate methods.
    /// </summary>
    public class PlayerInputController : Singleton<PlayerInputController>
    {
        [SerializeField, AutoSet] private PlayerInput m_input;
        [SerializeField] private PlayerInGameMenu m_playerMenu;

        private SpectatorNetwork m_spectatorNet = null;
        private bool m_freeLocomotionEnabled = true;
        public bool InputEnabled { get; set; } = true;

        public bool MovementEnabled { get; set; } = true;

        private bool m_wasMoving = false;
        private InputAction m_moveAction;

        public void SetSpectatorMode(SpectatorNetwork spectator)
        {
            m_spectatorNet = spectator;
            m_input.SwitchCurrentActionMap(m_spectatorNet != null ? "Spectator" : "Player");
        }

        public void OnSettingsUpdated()
        {
            m_freeLocomotionEnabled = !GameSettings.Instance.IsFreeLocomotionDisabled;
            PlayerMovement.Instance.RotationEitherThumbstick = !m_freeLocomotionEnabled;
        }

        private void Start()
        {
            m_freeLocomotionEnabled = !GameSettings.Instance.IsFreeLocomotionDisabled;
            PlayerMovement.Instance.RotationEitherThumbstick = !m_freeLocomotionEnabled;
        }

        private void OnDestroy()
        {
            PlayerMovement.Instance.RotationEitherThumbstick = true;
        }

        private void Update()
        {
            if (m_spectatorNet == null)
            {
                ProcessPlayerInput();
            }
        }

        public void OnSnapTurnLeft(CallbackContext context) => OnSnapTurn(context, false);
        public void OnSnapTurnRight(CallbackContext context) => OnSnapTurn(context, true);

        public void OnSnapTurnLeftNoFree(CallbackContext context)
        {
            if (PlayerMovement.Instance.RotationEitherThumbstick)
                OnSnapTurnLeft(context);
        }
        public void OnSnapTurnRightNoFree(CallbackContext context)
        {
            if (PlayerMovement.Instance.RotationEitherThumbstick)
                OnSnapTurnRight(context);
        }

        private void OnSnapTurn(CallbackContext context, bool toRight)
        {
            if (context.performed)
                PlayerMovement.Instance.DoSnapTurn(toRight);
        }

        public void OnMenuButton(CallbackContext context)
        {
            if (context.performed)
                m_playerMenu.Toggle();
        }

        public void OnSpectatorTriggerLeft(CallbackContext context)
        {
            if (context.phase is InputActionPhase.Performed)
                m_spectatorNet?.TriggerLeftAction();
        }

        public void OnSpectatorTriggerRight(CallbackContext context)
        {
            if (context.phase is InputActionPhase.Performed)
                m_spectatorNet?.TriggerRightAction();
        }

        public void OnMove(CallbackContext context)
        {
            m_moveAction = context.phase is InputActionPhase.Disabled ? null : context.action;
        }

        public void OnThrowLeft(CallbackContext context)
        {
            if (!InputEnabled) return;

            var glove = LocalPlayerEntities.Instance.LeftGloveHand;
            var gloveArmature = LocalPlayerEntities.Instance.LeftGloveArmature;
            if (context.phase is InputActionPhase.Performed)
                OnThrow(glove, gloveArmature);
            else if (context.phase is InputActionPhase.Canceled)
                OnRelease(glove, gloveArmature);
        }

        public void OnThrowRight(CallbackContext context)
        {
            if (!InputEnabled) return;

            var glove = LocalPlayerEntities.Instance.RightGloveHand;
            var gloveArmature = LocalPlayerEntities.Instance.RightGloveArmature;
            if (context.phase is InputActionPhase.Performed)
                OnThrow(glove, gloveArmature);
            else if (context.phase is InputActionPhase.Canceled)
                OnRelease(glove, gloveArmature);
        }

        public void OnShieldLeft(CallbackContext context)
        {
            if (!InputEnabled) return;

            OnShield(Glove.GloveSide.Left, context.phase is InputActionPhase.Performed);
        }

        public void OnShieldRight(CallbackContext context)
        {
            if (!InputEnabled) return;

            OnShield(Glove.GloveSide.Right, context.phase is InputActionPhase.Performed);
        }

        private void ProcessPlayerInput()
        {
            if (!InputEnabled)
            {
                if (m_wasMoving)
                {
                    ScreenFXManager.Instance.ShowLocomotionFX(false);
                    m_wasMoving = false;
                }
                return;
            }

            if (MovementEnabled && m_freeLocomotionEnabled)
            {
                var direction = m_moveAction?.ReadValue<Vector2>() ?? default;
                if (direction != Vector2.zero)
                {
                    var dir = new Vector3(direction.x, 0, direction.y);
                    PlayerMovement.Instance.WalkInDirectionRelToForward(dir);
                    if (!m_wasMoving)
                    {
                        ScreenFXManager.Instance.ShowLocomotionFX(true);
                    }

                    m_wasMoving = true;
                }
                else if (m_wasMoving)
                {
                    ScreenFXManager.Instance.ShowLocomotionFX(false);
                    m_wasMoving = false;
                }
            }
        }

        private static void OnShield(Glove.GloveSide side, bool state)
        {
            var playerController = LocalPlayerEntities.Instance.LocalPlayerController;
            if (state)
                playerController.TriggerShield(side);
            else
                playerController.StopShieldServerRPC(side);
        }

        private static void OnRelease(Glove glove, GloveArmatureNetworking gloveArmature)
        {
            if (glove && gloveArmature)
            {
                glove.TriggerAction(true, gloveArmature.SpringCompression);
                gloveArmature.Activated = false;
            }
        }

        private static void OnThrow(Glove glove, GloveArmatureNetworking gloveArmature)
        {
            if (glove)
            {
                glove.TriggerAction(false);
            }

            if (gloveArmature)
            {
                gloveArmature.Activated = true;
            }
        }
    }
}