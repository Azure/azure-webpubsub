// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using UnityEngine;

namespace UltimateGloveBall.Utils
{
    /// <summary>
    /// Utility functions added to vector3 to easily change one of the components (x, y or z) of a vector3.
    /// </summary>
    public static class Vector3Utils
    {
        public static Vector3 SetX(this Vector3 vec, float value)
        {
            return new Vector3(value, vec.y, vec.z);
        }
        public static Vector3 SetY(this Vector3 vec, float value)
        {
            return new Vector3(vec.x, value, vec.z);
        }
        public static Vector3 SetZ(this Vector3 vec, float value)
        {
            return new Vector3(vec.x, vec.y, value);
        }
    }
}
