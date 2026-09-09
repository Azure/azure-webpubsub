// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class CustomerOutboundConfigurationTests
{
    [Theory]
    [InlineData("network", 2)]
    [InlineData("ascii", 1)]
    [InlineData("cancellation", 1)]
    public async Task RetryExceptionTypesMatchRuntime(string failure, int expectedAttempts)
    {
        var attempts = 0;
        var policy = CustomerOutboundConfiguration.CreateRetryPolicy();
        var exception = await Record.ExceptionAsync(async () =>
        {
            using var response = await policy.ExecuteAsync(() =>
            {
                if (++attempts == 1)
                {
                    throw failure switch
                    {
                        "ascii" => new HttpRequestException("Request headers must contain only ASCII characters."),
                        "cancellation" => new OperationCanceledException(),
                        _ => new HttpRequestException("Connection reset."),
                    };
                }
                return Task.FromResult(new HttpResponseMessage());
            });
        });
        Assert.Equal(expectedAttempts, attempts);
        if (expectedAttempts == 2) Assert.Null(exception);
        else Assert.NotNull(exception);
    }

    [Fact]
    public async Task CancellationStopsRetryDelay()
    {
        using var cancellation = new CancellationTokenSource();
        var attempts = 0;
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            CustomerOutboundConfiguration.CreateRetryPolicy().ExecuteAsync(token =>
            {
                attempts++;
                cancellation.Cancel();
                return Task.FromResult(new HttpResponseMessage(System.Net.HttpStatusCode.ServiceUnavailable));
            }, cancellation.Token));
        Assert.Equal(1, attempts);
    }

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