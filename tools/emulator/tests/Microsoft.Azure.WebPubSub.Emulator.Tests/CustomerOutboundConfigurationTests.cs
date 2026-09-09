// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Net.Http;
using System.Text;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class CustomerOutboundConfigurationTests
{
    [Theory]
    [InlineData("X-ASRS-User-Id", true)]
    [InlineData("X-ASRS-User-Claims", true)]
    [InlineData("X-ASRS-Event", true)]
    [InlineData("ce-userId", true)]
    [InlineData("x-asrs-user-id", true)]
    [InlineData("x-asrs-user-claims", true)]
    [InlineData("x-asrs-event", true)]
    [InlineData("CE-USERID", true)]
    [InlineData("ce-eventName", false)]
    [InlineData("ce-hub", false)]
    [InlineData("Authorization", false)]
    [InlineData("X-Custom", false)]
    public void RequestHeaderEncodingMatchesRuntimeAllowlist(string headerName, bool unicodeAllowed)
    {
        using var handler = CustomerOutboundConfiguration.ConfigureHttpMessageHandler();
        using var request = new HttpRequestMessage();

        Assert.False(handler.UseCookies);
        Assert.NotNull(handler.RequestHeaderEncodingSelector);
        Assert.Equal(unicodeAllowed ? Encoding.UTF8 : null,
            handler.RequestHeaderEncodingSelector(headerName, request));
    }
}