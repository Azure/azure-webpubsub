// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

namespace UltimateGloveBall.Arena.Services
{
    /// <summary>
    /// Enum of the different team colors we use. Used by the TeamColorProfiles singleton.
    /// </summary>
    public enum TeamColor
    {
        // Each profile key should be in order A-B and it should be an even number
        Profile1TeamA,
        Profile1TeamB,
        Profile2TeamA,
        Profile2TeamB,
        Profile3TeamA,
        Profile3TeamB,
        Profile4TeamA,
        Profile4TeamB,

        Count,
    }
}