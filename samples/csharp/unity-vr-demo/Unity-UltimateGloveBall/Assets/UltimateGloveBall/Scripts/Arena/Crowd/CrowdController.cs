// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System.Collections;
using UltimateGloveBall.Arena.Gameplay;
using UltimateGloveBall.Arena.Services;
using Unity.Netcode;
using UnityEngine;
using Random = UnityEngine.Random;

namespace UltimateGloveBall.Arena.Crowd
{
    /// <summary>
    /// Controls the crowd npc in the bleachers. Initializing the crowd member and setting their team colors.
    /// It also handles the crowd audio based on the game score and the game phase. 
    /// </summary>
    public class CrowdController : NetworkBehaviour, IGamePhaseListener
    {
        private static readonly int s_attachmentColorID = Shader.PropertyToID("_Attachment_Color");

        public enum CrowdLevel
        {
            Full,
            Pct75,
            Half,
            Quarter,
            None,
        }

        [SerializeField] private CrowdNPC[] m_teamACrowd;
        [SerializeField] private CrowdNPC[] m_teamBCrowd;
        [SerializeField] private Material m_teamAAccessoriesAndItemsMat;
        [SerializeField] private Material m_teamBAccessoriesAndItemsMat;

        [SerializeField] private AudioSource m_crowdAAudioSource;
        [SerializeField] private AudioSource m_crowdBAudioSource;

        [SerializeField] private AudioClip[] m_idleSounds;

        [SerializeField] private AudioClip[] m_hitReactionSounds;
        [SerializeField] private AudioClip m_booSound;
        [SerializeField] private AudioClip m_chantSound;

        [SerializeField] private int m_booingDifferential = 3;

        [SerializeField] private GameManager m_gameManager;

        private float m_nextBooTimeTeamA = 0;
        private float m_nextBooTimeTeamB = 0;

        private float m_nextChantTimeTeamA = 0;
        private float m_nextChantTimeTeamB = 0;

        // keep track of score
        private int m_scoreA = -1;
        private int m_scoreB = -1;

        private void Start()
        {
            Initialize(m_teamACrowd, m_teamAAccessoriesAndItemsMat);
            Initialize(m_teamBCrowd, m_teamBAccessoriesAndItemsMat);
            m_gameManager.RegisterPhaseListener(this);

            StartIdleSound();
        }

        private void Update()
        {
            if (m_nextChantTimeTeamA > 0 && Time.realtimeSinceStartup >= m_nextChantTimeTeamA)
            {
                PlayChant(0);
                m_nextChantTimeTeamA += Random.Range(30f, 50f);
            }

            if (m_nextChantTimeTeamB > 0 && Time.realtimeSinceStartup >= m_nextChantTimeTeamB)
            {
                PlayChant(1);
                m_nextChantTimeTeamB += Random.Range(30f, 50f);
            }
        }

        public override void OnDestroy()
        {
            m_gameManager.UnregisterPhaseListener(this);
            base.OnDestroy();
        }

        public void OnPhaseChanged(GameManager.GamePhase phase)
        {
            if (phase == GameManager.GamePhase.PostGame)
            {
                m_nextChantTimeTeamA = 0;
                m_nextChantTimeTeamB = 0;
            }
        }

        public void OnPhaseTimeUpdate(double timeLeft)
        {
            // Nothing   
        }

        public void OnTeamColorUpdated(TeamColor teamColorA, TeamColor teamColorB)
        {
            SetAttachmentColor(teamColorA, teamColorB);
        }

        public override void OnNetworkSpawn()
        {
            if (IsServer)
            {
                GameState.Instance.Score.OnScoreUpdated += OnScoreUpdated;
            }
        }

        public override void OnNetworkDespawn()
        {
            GameState.Instance.Score.OnScoreUpdated -= OnScoreUpdated;
            base.OnNetworkDespawn();
        }

        public void SetAttachmentColor(TeamColor teamAColor, TeamColor teamBColor)
        {
            m_teamAAccessoriesAndItemsMat.SetColor(s_attachmentColorID, TeamColorProfiles.Instance.GetColorForKey(teamAColor));
            m_teamBAccessoriesAndItemsMat.SetColor(s_attachmentColorID, TeamColorProfiles.Instance.GetColorForKey(teamBColor));
        }

        public void SetCrowdLevel(CrowdLevel crowdLevel)
        {
            var pct = 100;
            switch (crowdLevel)
            {
                case CrowdLevel.Full:
                    pct = 100;
                    break;
                case CrowdLevel.Pct75:
                    pct = 75;
                    break;
                case CrowdLevel.Half:
                    pct = 50;
                    break;
                case CrowdLevel.Quarter:
                    pct = 25;
                    break;
                case CrowdLevel.None:
                    pct = 0;
                    break;
                default:
                    break;
            }

            UpdateCrowdLevel(m_teamACrowd, pct);
            UpdateCrowdLevel(m_teamBCrowd, pct);
        }

        private void UpdateCrowdLevel(CrowdNPC[] crowd, int pct)
        {
            var activeCount = pct >= 100 ? crowd.Length :
                pct <= 0 ? 0 : Mathf.FloorToInt(crowd.Length * pct / 100f);
            for (var i = 0; i < crowd.Length; ++i)
            {
                crowd[i].gameObject.SetActive(i < activeCount);
            }
        }

        private void Initialize(CrowdNPC[] crowd, Material accessoryAndItemsMat)
        {
            foreach (var npc in crowd)
            {
                // 3x3 faces
                var faceSwap = new Vector2(Random.Range(0, 3), Random.Range(0, 3));
                npc.Init(Random.Range(0f, 1f), Random.Range(0.9f, 1.1f), faceSwap);
            }
        }

        private void SetTeamColor(CrowdNPC[] crowd, TeamColor teamColor)
        {
            var color = TeamColorProfiles.Instance.GetColorForKey(teamColor);
            foreach (var npc in crowd)
            {
                npc.SetColor(color);
            }
        }

        private void OnScoreUpdated(int teamAScore, int teamBScore)
        {
            if (m_scoreA < 0 || m_scoreB < 0)
            {
                m_scoreA = teamAScore;
                m_scoreB = teamBScore;
                return;
            }

            var scoredA = teamAScore > m_scoreA;
            var scoredB = teamBScore > m_scoreB;

            if (scoredA)
            {
                PlayHitReaction(0);
                if (teamAScore > teamBScore && m_nextChantTimeTeamA <= 0)
                {
                    m_nextChantTimeTeamA = Time.realtimeSinceStartup + Random.Range(0, 10);
                }

                if (teamAScore >= teamBScore + m_booingDifferential)
                {
                    if (m_nextBooTimeTeamA <= Time.realtimeSinceStartup)
                    {
                        PlayBoo(1);
                        m_nextBooTimeTeamA = Time.realtimeSinceStartup + Random.Range(12f, 20f);
                    }
                }
            }

            if (scoredB)
            {
                PlayHitReaction(1);
                if (teamBScore > teamAScore && m_nextChantTimeTeamA <= 0)
                {
                    m_nextChantTimeTeamB = Time.realtimeSinceStartup + Random.Range(0, 10);
                }

                if (teamBScore >= teamAScore + m_booingDifferential)
                {
                    if (m_nextBooTimeTeamB <= Time.realtimeSinceStartup)
                    {
                        PlayBoo(0);
                        m_nextBooTimeTeamB = Time.realtimeSinceStartup + Random.Range(12f, 20f);
                    }
                }
            }

            m_scoreA = teamAScore;
            m_scoreB = teamBScore;
        }

        private void PlayHitReaction(int team)
        {
            PlaySoundClientRpc(new SoundParametersMessage(
                team, AudioEvents.HitReaction, Random.Range(0, m_hitReactionSounds.Length)));
        }

        private void PlayBoo(int team)
        {
            PlaySoundClientRpc(new SoundParametersMessage(
                team, AudioEvents.Boo));
        }

        private void PlayChant(int team)
        {
            PlaySoundClientRpc(new SoundParametersMessage(
                team, AudioEvents.Chant));
        }

        [ClientRpc]
        private void PlaySoundClientRpc(SoundParametersMessage soundMsg)
        {
            var audioSource = soundMsg.Team == 0 ? m_crowdAAudioSource : m_crowdBAudioSource;
            switch (soundMsg.AudioEvent)
            {
                case AudioEvents.HitReaction:
                    audioSource.PlayOneShot(m_hitReactionSounds[soundMsg.AudioEventIndex]);
                    break;

                case AudioEvents.Boo:
                    audioSource.PlayOneShot(m_booSound);
                    break;

                case AudioEvents.Chant:
                    audioSource.PlayOneShot(m_chantSound);
                    break;
                case AudioEvents.Idle:
                    break;
                default:
                    break;
            }
        }

        private void StartIdleSound()
        {
            _ = StartCoroutine(PlayIdleCoroutine(0));
            _ = StartCoroutine(PlayIdleCoroutine(1));
        }

        private IEnumerator PlayIdleCoroutine(int team)
        {
            var audioSource = team == 0 ? m_crowdAAudioSource : m_crowdBAudioSource;

            while (true)
            {
                var idleIndex = Random.Range(0, m_idleSounds.Length);
                var clip = m_idleSounds[idleIndex];
                audioSource.clip = clip;
                audioSource.loop = true;
                audioSource.time = Random.Range(0, clip.length);
                audioSource.Play();
                // wait a full audio loop
                yield return new WaitForSeconds(clip.length);
            }
        }

        internal enum AudioEvents
        {
            Idle,
            HitReaction,
            Boo,
            Chant,
        }

        private struct SoundParametersMessage : INetworkSerializable
        {
            public int Team;
            public AudioEvents AudioEvent;
            public int AudioEventIndex;

            internal SoundParametersMessage(int team, AudioEvents audioEvent, int index = 0)
            {
                Team = team;
                AudioEvent = audioEvent;
                AudioEventIndex = index;
            }

            public void NetworkSerialize<T>(BufferSerializer<T> serializer) where T : IReaderWriter
            {
                serializer.SerializeValue(ref Team);
                serializer.SerializeValue(ref AudioEvent);
                serializer.SerializeValue(ref AudioEventIndex);
            }
        }
    }
}