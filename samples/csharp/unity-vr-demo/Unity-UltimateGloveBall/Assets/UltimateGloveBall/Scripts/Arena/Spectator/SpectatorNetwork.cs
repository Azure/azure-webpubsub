// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System.Collections;
using UltimateGloveBall.Arena.Crowd;
using UltimateGloveBall.Arena.Player;
using UltimateGloveBall.Arena.Services;
using Unity.Netcode;
using UnityEngine;

namespace UltimateGloveBall.Arena.Spectator
{
    /// <summary>
    /// Network representation of the spectator. It chooses a random body form and spectators can selection which item
    /// their spectator representation shows, which is propagated through the network. It also handles the firework
    /// launching.
    /// </summary>
    public class SpectatorNetwork : NetworkBehaviour
    {
        private const float ITEM_CHANGE_PROPAGATION_DELAY = 1f;
        [SerializeField] private CrowdNPC[] m_spectatorPrefabs;
        [SerializeField] private Color m_bodyColor;

        [SerializeField] private SpectatorItem[] m_itemPrefabs;

        [SerializeField] private FireworkLauncherItem m_fireworkLauncher;

        private NetworkVariable<int> m_prefabIndex = new(-1);
        private NetworkVariable<TeamColor> m_teamColor = new();

        private NetworkVariable<int> m_itemIndexNet = new(-1, writePerm: NetworkVariableWritePermission.Owner);

        private SpectatorItem[] m_items;
        private int m_itemIndex = 0;

        private CrowdNPC m_spectator;

        private bool m_willSendItemChange = false;

        public TeamColor TeamSideColor
        {
            set => m_teamColor.Value = value;
        }

        private void Awake()
        {
            m_prefabIndex.OnValueChanged += OnPrefabIndexChanged;
            m_teamColor.OnValueChanged += OnTeamColorChanged;
        }

        public override void OnDestroy()
        {
            if (m_items != null)
            {
                foreach (var item in m_items)
                {
                    if (item)
                    {
                        Destroy(item.gameObject);
                    }
                }
            }

            if (m_fireworkLauncher != null)
            {
                Destroy(m_fireworkLauncher.gameObject);
            }
        }

        public override void OnNetworkSpawn()
        {
            if (IsOwner)
            {
                PlayerMovement.Instance.SnapPositionToTransform(transform);
                OVRScreenFade.instance.FadeIn();
                PlayerInputController.Instance.SetSpectatorMode(this);

                var cameraRig = FindObjectOfType<OVRCameraRig>();
                m_items = new SpectatorItem[m_itemPrefabs.Length];
                m_itemIndex = Random.Range(0, m_itemPrefabs.Length);
                m_itemIndexNet.Value = m_itemIndex;
                for (var i = 0; i < m_itemPrefabs.Length; ++i)
                {
                    m_items[i] = Instantiate(m_itemPrefabs[i], cameraRig.leftControllerAnchor, false);
                    m_items[i].gameObject.SetActive(i == m_itemIndex);
                }

                m_fireworkLauncher.gameObject.SetActive(true);
                m_fireworkLauncher.transform.SetParent(cameraRig.rightControllerAnchor, false);
                m_fireworkLauncher.OnLaunch += OnFireworkLaunchServerRPC;
                OnTeamColorChanged(m_teamColor.Value, m_teamColor.Value);
            }
            else
            {
                m_itemIndexNet.OnValueChanged += OnItemChanged;
                enabled = false;
            }

            if (IsServer)
            {
                m_prefabIndex.Value = Random.Range(0, m_spectatorPrefabs.Length);
            }
            else
            {
                OnPrefabIndexChanged(m_prefabIndex.Value, m_prefabIndex.Value);
            }
        }

        public override void OnNetworkDespawn()
        {
            if (IsOwner)
            {
                PlayerInputController.Instance.SetSpectatorMode(null);
            }
        }

        private void OnPrefabIndexChanged(int previousvalue, int newvalue)
        {
            // don't spawn for owner
            if (!IsOwner)
            {
                if (newvalue > -1 && m_spectator == null)
                {
                    var prefab = m_spectatorPrefabs[newvalue];
                    m_spectator = Instantiate(prefab, transform, false);
                    m_spectator.SetBodyColor(m_bodyColor);
                    OnTeamColorChanged(m_teamColor.Value, m_teamColor.Value);
                }
            }
        }

        private void OnTeamColorChanged(TeamColor previousvalue, TeamColor newvalue)
        {
            if (m_spectator)
            {
                var color = TeamColorProfiles.Instance.GetColorForKey(newvalue);
                m_spectator.SetColor(color);
            }

            if (IsOwner)
            {
                var color = TeamColorProfiles.Instance.GetColorForKey(newvalue);
                foreach (var item in m_items)
                {
                    item.SetColor(color);
                }

                m_fireworkLauncher.SetColor(color);
            }
        }

        private void OnItemChanged(int previousvalue, int newvalue)
        {
            if (m_spectator)
            {
                m_spectator.ChangeItem(newvalue);
            }
        }

        public void RequestSwitchSide()
        {
            RequestSwitchSideServerRPC();
        }

        [ServerRpc]
        private void RequestSwitchSideServerRPC()
        {
            var newLocation =
                ((ArenaPlayerSpawningManager)SpawningManagerBase.Instance).SwitchSpectatorSide(OwnerClientId, this);

            if (newLocation)
            {
                OnSideChangedClientRPC(newLocation.position, newLocation.rotation);
            }
        }

        [ClientRpc]
        public void OnSideChangedClientRPC(Vector3 newPos, Quaternion newRotation)
        {
            var thisTrans = transform;
            thisTrans.position = newPos;
            thisTrans.rotation = newRotation;
            if (IsOwner)
            {
                PlayerMovement.Instance.SnapPosition(newPos, newRotation);
            }
        }

        public void TriggerLeftAction()
        {
            if (m_items is { Length: > 0 })
            {
                m_items[m_itemIndex].gameObject.SetActive(false);
                m_itemIndex = ++m_itemIndex % m_items.Length;
                m_items[m_itemIndex].gameObject.SetActive(true);
                if (!m_willSendItemChange)
                {
                    _ = StartCoroutine(DelayItemChangePropagation());
                }
            }
        }

        public void TriggerRightAction()
        {
            m_fireworkLauncher.TryLaunch();
        }

        [ServerRpc]
        private void OnFireworkLaunchServerRPC(Vector3 destination, float travelTime)
        {
            OnFireworkLaunchClientRpc(destination, travelTime);
        }

        [ClientRpc]
        private void OnFireworkLaunchClientRpc(Vector3 destination, float travelTime)
        {
            if (!IsOwner)
            {
                SpectatorFireworkController.Instance.DelayFireworkAt(destination, travelTime);
            }
        }

        private IEnumerator DelayItemChangePropagation()
        {
            if (m_willSendItemChange)
            {
                yield break;
            }

            m_willSendItemChange = true;

            var timer = Time.deltaTime;
            while (timer < ITEM_CHANGE_PROPAGATION_DELAY)
            {
                yield return null;
                timer += Time.deltaTime;
            }

            m_itemIndexNet.Value = m_itemIndex;

            m_willSendItemChange = false;
        }
    }
}