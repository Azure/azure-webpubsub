// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class UpstreamConnectionContextTests
{
    [Theory]
    [InlineData("subject", "name", "subject")]
    [InlineData("subject", null, "subject")]
    [InlineData(null, "name", "name")]
    [InlineData(null, null, null)]
    [InlineData("", "name", "")]
    public void CreatePreservesUserIdPrecedence(string? subject, string? nameIdentifier, string? expected)
    {
        var identity = new ClaimsIdentity();
        if (subject is not null) identity.AddClaim(new Claim("sub", subject));
        if (nameIdentifier is not null) identity.AddClaim(new Claim(ClaimTypes.NameIdentifier, nameIdentifier));

        var context = UpstreamConnectionContext.Create(
            "connection", "chat", new ClaimsPrincipal(identity), "custom.protocol", "example.test");

        Assert.Equal(expected, context.UserId);
        Assert.Equal("connection", context.ConnectionId);
        Assert.Equal("chat", context.Hub);
        Assert.Equal("custom.protocol", context.Subprotocol);
        Assert.Equal("example.test", context.Host);
    }

    [Fact]
    public void SignatureIsReusedForEqualKeysAndRefreshedWhenKeyChanges()
    {
        var connection = new UpstreamConnectionContext("connection", "chat", null, null, "localhost");
        var key = EmulatorOptions.DefaultAccessKey;
        var signature = connection.GetSignature(key);
        Assert.Same(signature, connection.GetSignature(new string(key.ToCharArray())));

        var changedKey = key + "-changed";
        var changedSignature = connection.GetSignature(changedKey);
        var hash = HMACSHA256.HashData(Encoding.UTF8.GetBytes(changedKey), Encoding.UTF8.GetBytes(connection.ConnectionId));
        Assert.Equal($"sha256={Convert.ToHexStringLower(hash)}", changedSignature);
        Assert.NotEqual(signature, changedSignature);
        Assert.Same(changedSignature, connection.GetSignature(changedKey));
        Assert.Equal(signature, connection.GetSignature(key));
    }

    [Fact]
    public void SignatureIsScopedToConnection()
    {
        var first = new UpstreamConnectionContext("first", "chat", null, null, "localhost");
        var second = new UpstreamConnectionContext("second", "chat", null, null, "localhost");

        Assert.NotEqual(first.GetSignature(EmulatorOptions.DefaultAccessKey),
            second.GetSignature(EmulatorOptions.DefaultAccessKey));
    }

    [Fact]
    public void ConcurrentRequestsReuseTheSameSignatureInstance()
    {
        var connection = new UpstreamConnectionContext("connection", "chat", null, null, "localhost");
        var signatures = new string[32];

        Parallel.For(0, signatures.Length, i => signatures[i] = connection.GetSignature(EmulatorOptions.DefaultAccessKey));

        Assert.All(signatures, signature => Assert.Same(signatures[0], signature));
    }
}