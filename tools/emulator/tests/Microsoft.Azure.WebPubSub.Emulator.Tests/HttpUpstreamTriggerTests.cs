// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class HttpUpstreamTriggerTests
{
    private static readonly TimeSpan TestTimeout = TimeSpan.FromSeconds(20);

    [Theory]
    [InlineData(200, "*", true)]
    [InlineData(202, "EMULATOR.EXAMPLE.TEST", true)]
    [InlineData(404, "*", true)]
    [InlineData(405, "*", false)]
    [InlineData(200, null, false)]
    [InlineData(200, "other.example.test", false)]
    [InlineData(200, "other.example.test, emulator.example.test", false)]
    public async Task ValidationGatesPostsAndCachesOutcome(int status, string? allowedOrigin, bool allowed)
    {
        var methods = new List<string>();
        var posts = 0;
        await using var fixture = await Fixture.StartAsync(context =>
        {
            if (HttpMethods.IsPost(context.Request.Method))
            {
                Interlocked.Increment(ref posts);
                Assert.False(context.Request.Headers.ContainsKey("Cookie"));
            }
            else
            {
                methods.Add(context.Request.Method);
                Assert.Equal("/events/chat/validate", context.Request.Path);
                Assert.Equal("emulator.example.test", context.Request.Headers["WebHook-Request-Origin"].ToString());
                Assert.Equal("1.0", context.Request.Headers["ce-awpsversion"].ToString());
                Assert.False(context.Request.Headers.ContainsKey("ce-signature"));
                Assert.False(context.Request.Headers.ContainsKey("Authorization"));
                Assert.False(context.Request.Headers.ContainsKey("Cookie"));
                context.Response.StatusCode = HttpMethods.IsGet(context.Request.Method) ? 200 : status;
                if (allowedOrigin is not null) context.Response.Headers["WebHook-Allowed-Origin"] = allowedOrigin;
                context.Response.Cookies.Append("validation-only", "ignored");
            }
            return Task.CompletedTask;
        });
        for (var i = 0; i < 2; i++)
        {
            if (allowed)
            {
                using var response = await fixture.SendAsync().WaitAsync(TestTimeout);
                Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            }
            else
            {
                await Assert.ThrowsAsync<HttpRequestException>(() => fixture.SendAsync().WaitAsync(TestTimeout));
            }
        }
        Assert.Equal(status == 404 ? new[] { "OPTIONS", "GET" } : new[] { "OPTIONS" }, methods);
        Assert.Equal(allowed ? 2 : 0, posts);
    }

    [Fact]
    public async Task ValidationUsesRetryPolicyAndCachesByResolvedUri()
    {
        var validations = 0;
        var posts = 0;
        await using var fixture = await Fixture.StartAsync(context =>
        {
            if (HttpMethods.IsOptions(context.Request.Method))
            {
                context.Response.StatusCode = Interlocked.Increment(ref validations) == 1 ? 503 : 200;
                context.Response.Headers["WebHook-Allowed-Origin"] = "*";
            }
            else Interlocked.Increment(ref posts);
            return Task.CompletedTask;
        });
        using var first = await fixture.SendAsync().WaitAsync(TestTimeout);
        Assert.Equal(2, validations);
        using var second = await fixture.SendAsync().WaitAsync(TestTimeout);
        Assert.Equal(2, validations);
        using var other = await fixture.SendAsync(new Uri(fixture.ValidationUri + "?handler=other")).WaitAsync(TestTimeout);
        Assert.Equal(3, validations);
        Assert.Equal(3, posts);
    }

    [Fact]
    public async Task ValidationTimeoutDoesNotSendPostOrRetryCancellation()
    {
        var validations = 0;
        var posts = 0;
        var timer = Stopwatch.StartNew();
        await using var fixture = await Fixture.StartAsync(async context =>
        {
            if (HttpMethods.IsOptions(context.Request.Method))
            {
                Interlocked.Increment(ref validations);
                try { await Task.Delay(Timeout.InfiniteTimeSpan, context.RequestAborted); }
                catch (OperationCanceledException) { }
            }
            else Interlocked.Increment(ref posts);
        });
        await Assert.ThrowsAsync<HttpRequestException>(() => fixture.SendAsync().WaitAsync(TestTimeout));
        Assert.True(timer.Elapsed >= TimeSpan.FromSeconds(9.5));
        Assert.Equal(1, validations);
        Assert.Equal(0, posts);
    }

    [Fact]
    public async Task FirstValidationIsSharedAndBlocksConcurrentPosts()
    {
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var validations = 0;
        var posts = 0;
        await using var fixture = await Fixture.StartAsync(async context =>
        {
            if (HttpMethods.IsOptions(context.Request.Method))
            {
                Interlocked.Increment(ref validations);
                entered.TrySetResult();
                await release.Task.WaitAsync(TestTimeout);
                context.Response.Headers["WebHook-Allowed-Origin"] = "*";
            }
            else Interlocked.Increment(ref posts);
        });
        var requests = Enumerable.Range(0, 8).Select(_ => fixture.SendAsync()).ToArray();
        try
        {
            await entered.Task.WaitAsync(TestTimeout);
            Assert.All(requests, request => Assert.False(request.IsCompleted));
            Assert.Equal(0, Volatile.Read(ref posts));
            Assert.Equal(1, Volatile.Read(ref validations));
        }
        finally { release.TrySetResult(); }
        foreach (var response in await Task.WhenAll(requests).WaitAsync(TestTimeout)) response.Dispose();
        Assert.Equal(8, posts);
        Assert.Equal(1, validations);
    }

    [Fact]
    public async Task ValidationCacheRefreshesWithRuntimeIntervals()
    {
        var clock = new TestClock();
        var gates = Channel.CreateUnbounded<TaskCompletionSource>();
        var attempts = Channel.CreateUnbounded<bool>();
        var allow = true;
        await using var fixture = await Fixture.StartAsync(async context =>
        {
            attempts.Writer.TryWrite(true);
            var gate = await gates.Reader.ReadAsync();
            await gate.Task.WaitAsync(TestTimeout);
            if (allow) context.Response.Headers["WebHook-Allowed-Origin"] = "*";
        }, clock);
        var protector = fixture.App.Services.GetRequiredService<AbuseProtector>();
        Task<bool> Validate() => protector.ValidateAsync(fixture.ValidationUri, "emulator.example.test");
        TaskCompletionSource Queue(bool released)
        {
            var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            if (released) gate.SetResult();
            gates.Writer.TryWrite(gate);
            return gate;
        }
        Queue(true);
        Assert.True(await Validate().WaitAsync(TestTimeout));
        Assert.True(attempts.Reader.TryRead(out _));
        clock.Advance(TimeSpan.FromSeconds(59));
        Assert.True(await Validate());
        Assert.False(attempts.Reader.TryRead(out _));

        // Successful entries expire after one minute; refresh is non-blocking.
        allow = false;
        clock.Advance(TimeSpan.FromSeconds(1));
        var refreshGate = Queue(false);
        Assert.True(await Validate().WaitAsync(TestTimeout));
        await attempts.Reader.ReadAsync().AsTask().WaitAsync(TestTimeout);
        refreshGate.SetResult();
        await WaitForResultAsync(Validate, false);

        // Failure after success retries in 1s, then 2/4/8/16/32/60s, capped at 60s.
        foreach (var seconds in new[] { 1, 2, 4, 8, 16, 32, 60, 60 })
        {
            clock.Advance(TimeSpan.FromSeconds(seconds) - TimeSpan.FromMilliseconds(1));
            Assert.False(await Validate());
            Assert.False(attempts.Reader.TryRead(out _));
            var gate = Queue(false);
            clock.Advance(TimeSpan.FromMilliseconds(1));
            Assert.False(await Validate());
            await attempts.Reader.ReadAsync().AsTask().WaitAsync(TestTimeout);
            var reads = clock.ReadCount;
            gate.SetResult();
            await clock.WaitForReadAsync(reads);
            Assert.False(await Validate());
        }
        allow = true;
        Queue(true);
        clock.Advance(TimeSpan.FromMinutes(1));
        await Validate();
        await WaitForResultAsync(Validate, true);
    }

    [Theory]
    [InlineData(408, 2)]
    [InlineData(503, 2)]
    [InlineData(599, 2)]
    [InlineData(400, 1)]
    [InlineData(401, 1)]
    [InlineData(404, 1)]
    [InlineData(429, 1)]
    public async Task RetryStatusCodesMatchRuntime(int status, int expectedAttempts)
    {
        var attempts = 0;
        await using var fixture = await Fixture.StartAsync(context =>
        {
            if (HttpMethods.IsOptions(context.Request.Method)) context.Response.Headers["WebHook-Allowed-Origin"] = "*";
            else context.Response.StatusCode = Interlocked.Increment(ref attempts) == 1 ? status : 200;
            return Task.CompletedTask;
        });
        using var response = await fixture.SendAsync().WaitAsync(TestTimeout);
        Assert.Equal(expectedAttempts, attempts);
        Assert.Equal(expectedAttempts == 2 ? 200 : status, (int)response.StatusCode);
    }

    [Fact]
    public async Task RetryExhaustionUsesOneThreeFiveSecondsAndReplaysRequest()
    {
        var times = new List<TimeSpan>();
        var timer = Stopwatch.StartNew();
        await using var fixture = await Fixture.StartAsync(async context =>
        {
            if (HttpMethods.IsOptions(context.Request.Method))
            {
                context.Response.Headers["WebHook-Allowed-Origin"] = "*";
                return;
            }
            times.Add(timer.Elapsed);
            Assert.Equal("stable-request-id", context.Request.Headers["x-ms-client-request-id"].ToString());
            Assert.Equal("{\"message\":\"hello\"}", await new System.IO.StreamReader(context.Request.Body).ReadToEndAsync());
            context.Response.StatusCode = 503;
        });
        using var response = await fixture.SendAsync().WaitAsync(TestTimeout);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal(4, times.Count);
        for (var i = 1; i < times.Count; i++) Assert.True(times[i] - times[i - 1] >= TimeSpan.FromSeconds(2 * i - 1) - TimeSpan.FromMilliseconds(100));
    }

    private static async Task WaitForResultAsync(Func<Task<bool>> validate, bool expected)
    {
        using var timeout = new CancellationTokenSource(TestTimeout);
        while (await validate() != expected)
        {
            timeout.Token.ThrowIfCancellationRequested();
            await Task.Yield();
        }
    }

    private sealed class TestClock : TimeProvider
    {
        private long _ticks = DateTimeOffset.UtcNow.Ticks;
        private int _reads;
        public int ReadCount => Volatile.Read(ref _reads);
        public override DateTimeOffset GetUtcNow()
        {
            var now = new DateTimeOffset(Interlocked.Read(ref _ticks), TimeSpan.Zero);
            Interlocked.Increment(ref _reads);
            return now;
        }
        public void Advance(TimeSpan duration) => Interlocked.Add(ref _ticks, duration.Ticks);
        public async Task WaitForReadAsync(int previous)
        {
            using var timeout = new CancellationTokenSource(TestTimeout);
            while (ReadCount == previous)
            {
                timeout.Token.ThrowIfCancellationRequested();
                await Task.Yield();
            }
        }
    }

    private sealed class Fixture(WebApplication upstream, WebApplication app) : IAsyncDisposable
    {
        public WebApplication App { get; } = app;
        public Uri ValidationUri => new(upstream.Urls.Single() + "/events/chat/validate");

        public static async Task<Fixture> StartAsync(RequestDelegate handle, TimeProvider? clock = null)
        {
            var builder = WebApplication.CreateBuilder();
            builder.Logging.ClearProviders();
            builder.WebHost.UseUrls("http://127.0.0.1:0");
            var upstream = builder.Build();
            upstream.Run(handle);
            await upstream.StartAsync().WaitAsync(TestTimeout);
            var emulatorBuilder = EmulatorApplication.CreateBuilder(["--urls=http://127.0.0.1:0"]);
            emulatorBuilder.Logging.ClearProviders();
            if (clock is not null) emulatorBuilder.Services.AddSingleton(clock);
            var app = EmulatorApplication.Build(emulatorBuilder);
            await app.StartAsync().WaitAsync(TestTimeout);
            return new Fixture(upstream, app);
        }

        public async Task<HttpResponseMessage> SendAsync(Uri? validationUri = null)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(upstream.Urls.Single() + "/events/chat/connected"))
            {
                Content = new StringContent("{\"message\":\"hello\"}", Encoding.UTF8, "application/json"),
            };
            request.Headers.Add("x-ms-client-request-id", "stable-request-id");
            var connection = new UpstreamConnectionContext(Guid.NewGuid().ToString(), "chat", null, null, "emulator.example.test");
            return await App.Services.GetRequiredService<HttpUpstreamTrigger>().SendAsync(request, validationUri ?? ValidationUri, connection, CancellationToken.None);
        }

        public async ValueTask DisposeAsync()
        {
            await App.DisposeAsync();
            await upstream.DisposeAsync();
        }
    }
}