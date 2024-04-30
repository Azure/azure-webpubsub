// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System;
#if UNITY_EDITOR
using System.Security.Cryptography;
#endif
using System.Text;
using Meta.Utilities;
using UnityEngine;

namespace UltimateGloveBall.App
{
    /// <summary>
    /// Keeps track of the local player state that can be access from anywhere.
    /// These are game specific player states.
    /// </summary>
    public class LocalPlayerState : Singleton<LocalPlayerState>
    {
        [SerializeField] private string m_applicationID;

        public event Action OnChange;

        public string Username { get; private set; }
        public ulong UserId { get; private set; }
        public string ApplicationID => m_applicationID;
        public string PlayerUid { get; private set; }
        public bool HasCustomAppId { get; private set; }
        public bool IsSpectator { get; set; }

        private new void OnEnable()
        {
            base.OnEnable();

            DontDestroyOnLoad(this);
        }

        protected override void InternalAwake()
        {
            base.InternalAwake();

            HasCustomAppId = true;
            if (string.IsNullOrEmpty(m_applicationID))
            {
                HasCustomAppId = false;
                // for the time being, force unique session ID
                m_applicationID = GenerateApplicationID();
            }

            PlayerUid = PlayerPrefs.GetString("PlayerUid", GeneratePlayerID());
            PlayerPrefs.SetString("PlayerUid", PlayerUid);
#if UNITY_EDITOR
            // When using multiple editors for the same project we need to append a unique id based on
            // the location of the project, since it will be unique per instances of editors.
            var hashedBytes = new MD5CryptoServiceProvider()
                .ComputeHash(Encoding.UTF8.GetBytes(Application.dataPath));
            Array.Resize(ref hashedBytes, 16);
            PlayerUid += new Guid(hashedBytes).ToString("N");
#endif
        }

        public void SetApplicationID(string applicationId)
        {
            m_applicationID = applicationId;
            HasCustomAppId = !string.IsNullOrWhiteSpace(applicationId);
        }

        public void Init(string username, ulong userId)
        {
            Username = username;
            UserId = userId;
            OnChange?.Invoke();
        }

        private string GenerateApplicationID()
        {
            var id = (uint)(UnityEngine.Random.value * uint.MaxValue);
            return id.ToString("X").ToLower();
        }

        // Generate a unique playerId
        private string GeneratePlayerID()
        {
            return Guid.NewGuid().ToString();
        }
    }
}