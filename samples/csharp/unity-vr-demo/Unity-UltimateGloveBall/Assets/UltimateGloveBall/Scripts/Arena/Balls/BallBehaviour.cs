// Copyright (c) Meta Platforms, Inc. and affiliates.
// Use of the material below is subject to the terms of the MIT License
// https://github.com/oculus-samples/Unity-UltimateGloveBall/tree/main/Assets/UltimateGloveBall/LICENSE

using Unity.Netcode;

namespace UltimateGloveBall.Arena.Balls
{
    /// <summary>
    /// Base network ball behaviour to be implemented by the different types of balls.
    /// </summary>
    public abstract class BallBehaviour : NetworkBehaviour
    {
        public virtual void ResetBall()
        {
        }
    }
}