// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using System.Collections.Generic;

namespace UltimateGloveBall.App
{
    /// <summary>
    /// Maps Photon regions to user readable names.
    /// </summary>
    public static class NetworkRegionMapping
    {
        private static readonly Dictionary<string, string> s_regionMap = new()
        {
            {"usw", "North America"},
            {"eu", "Europe"},
            {"jp", "Japan"},
            {"sa", "South America"},
            {"asia", "Asia"},
            {"au", "Australia"},
        };

        public static string GetRegionName(string regionKey)
        {
            _ = s_regionMap.TryGetValue(regionKey, out var name);
            if (string.IsNullOrEmpty(name))
            {
                name = regionKey;
            }
            return name;
        }

        public static string GetRegionShortName(string regionKey)
        {
            return regionKey == "usw" ? "NA" : regionKey.ToUpper();
        }
    }
}