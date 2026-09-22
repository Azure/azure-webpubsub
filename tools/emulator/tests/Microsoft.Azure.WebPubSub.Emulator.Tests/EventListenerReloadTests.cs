// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Azure.Messaging.EventHubs.Producer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;
using Xunit;
using RecordingProducer = Microsoft.Azure.WebPubSub.Emulator.Tests.EventHubNotifierTests.RecordingProducer;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class EventListenerReloadTests
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(15);

    [Fact]
    public async Task FilterChangesReuseUnchangedProducer()
    {
        var producer = new RecordingProducer();
        await using var fixture = await Fixture.StartAsync(_ => producer);
        Assert.True(await fixture.SendAsync());
        await producer.ReadAsync();
        await fixture.WriteAsync(Settings("first", "updated", ["connected"]));
        Assert.False(await fixture.SendAsync());
        Assert.True(await fixture.SendAsync("updated"));
        Assert.True(await fixture.SendAsync("connected", userEvent: false));
        Assert.Equal(1, fixture.Creations);
        Assert.False(producer.Disposed);
    }

    [Fact]
    public async Task ChangedTargetDrainsInflightSendBeforeDisposingOldProducer()
    {
        var finish = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var first = new RecordingProducer { OnSend = _ => finish.Task };
        var second = new RecordingProducer();
        await using var fixture = await Fixture.StartAsync(endpoint => endpoint.EventHubName == "first" ? first : second);
        var sending = fixture.SendAsync();
        try
        {
            await first.ReadAsync();
            await fixture.WriteAsync(Settings("second"));
            Assert.False(first.Disposed);
            Assert.True(await fixture.SendAsync());
            await second.ReadAsync();
            Assert.Equal(2, fixture.Creations);
        }
        finally { finish.TrySetResult(); }
        Assert.True(await sending.WaitAsync(Timeout));
        await first.DisposalStarted.Task.WaitAsync(Timeout);
        Assert.Equal(1, first.DisposeCount);
        Assert.False(second.Disposed);
    }

    [Fact]
    public async Task RemovalDisposesUsedProducerAndReadditionCreatesAnother()
    {
        var first = new RecordingProducer();
        var second = new RecordingProducer();
        var count = 0;
        await using var fixture = await Fixture.StartAsync(_ => ++count == 1 ? first : second);
        Assert.True(await fixture.SendAsync());
        await fixture.WriteAsync(Settings(null));
        await first.DisposalStarted.Task.WaitAsync(Timeout);
        Assert.False(await fixture.SendAsync());
        await fixture.WriteAsync(Settings("first"));
        Assert.True(await fixture.SendAsync());
        Assert.Equal(2, fixture.Creations);
        Assert.Equal(1, first.DisposeCount);
        Assert.False(second.Disposed);
    }

    [Fact]
    public async Task RemovingUnusedTargetsDoesNotCreateClients()
    {
        await using var fixture = await Fixture.StartAsync(_ => new RecordingProducer());
        await fixture.WriteAsync(Settings(null));
        Assert.Equal(0, fixture.Creations);
        Assert.False(await fixture.SendAsync());
        await fixture.WriteAsync(Settings("added"));
        Assert.Equal(0, fixture.Creations);
        Assert.True(await fixture.SendAsync());
        Assert.Equal(1, fixture.Creations);
    }

    [Theory]
    [InlineData("invalidHandler")]
    [InlineData("endpoint")]
    [InlineData("missingName")]
    [InlineData("unknownFilter")]
    public async Task InvalidEditKeepsBothHandlersAndListenersUntilCorrected(string invalid)
    {
        var first = new RecordingProducer();
        var second = new RecordingProducer();
        await using var fixture = await Fixture.StartAsync(endpoint => endpoint.EventHubName == "first" ? first : second);
        Assert.True(await fixture.SendAsync());
        var updated = Settings("second", handlerPath: "/changed");
        var json = invalid switch
        {
            "invalidHandler" => updated.Replace("http://localhost:1/changed", "ftp://localhost/changed"),
            "endpoint" => updated.Replace("local.test", "https://invalid.example"),
            "missingName" => updated.Replace("\"EventHubName\":\"second\"", "\"EventHubName\":\"\""),
            _ => updated.Replace("\"EventNameFilter\":{", "\"EventNameFilter\":{\"Unexpected\":true,"),
        };
        await fixture.WriteAsync(json, LogLevel.Warning);
        Assert.Equal("http://localhost:1/original", Assert.Single(fixture.Configuration.GetHandlers("chat")).UrlTemplate);
        Assert.True(await fixture.SendAsync());
        Assert.Equal(1, fixture.Creations);
        Assert.False(first.Disposed);
        await fixture.WriteAsync(updated);
        Assert.Equal("http://localhost:1/changed", Assert.Single(fixture.Configuration.GetHandlers("chat")).UrlTemplate);
        Assert.True(await fixture.SendAsync());
        Assert.Equal(2, fixture.Creations);
        await first.DisposalStarted.Task.WaitAsync(Timeout);
    }

    [Fact]
    public async Task ShutdownAwaitsAlreadyRemovedProducerDisposal()
    {
        var finish = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var producer = new RecordingProducer { OnDispose = () => finish.Task };
        await using var fixture = await Fixture.StartAsync(_ => producer);
        try
        {
            await fixture.SendAsync();
            await fixture.WriteAsync(Settings(null));
            await producer.DisposalStarted.Task.WaitAsync(Timeout);
            var disposing = fixture.Notifier.DisposeAsync().AsTask();
            Assert.False(disposing.IsCompleted);
            finish.TrySetResult();
            await disposing.WaitAsync(Timeout);
            Assert.Equal(1, producer.DisposeCount);
        }
        finally { finish.TrySetResult(); }
    }

    [Fact]
    public async Task ExistingWebSocketUsesNewListenerWithoutReconnect()
    {
        var first = new RecordingProducer();
        var second = new RecordingProducer();
        await using var fixture = await Fixture.StartAsync(endpoint => endpoint.EventHubName == "first" ? first : second);
        var token = new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
            audience: "http://localhost/client/hubs/chat", expires: DateTime.UtcNow.AddMinutes(5),
            signingCredentials: new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(EmulatorOptions.DefaultAccessKey)), SecurityAlgorithms.HmacSha256)));
        var client = fixture.App.GetTestServer().CreateWebSocketClient();
        client.SubProtocols.Add("json.webpubsub.azure.v1");
        using var socket = await client.ConnectAsync(new Uri("ws://localhost/client/hubs/chat?access_token=" + token), CancellationToken.None).WaitAsync(Timeout);
        using var connected = await ReceiveAsync(socket);
        var connectionId = connected.RootElement.GetProperty("connectionId").GetString();
        await SendAsync(socket, 1);
        var before = await first.ReadAsync();
        await fixture.WriteAsync(Settings("second"));
        await SendAsync(socket, 2);
        var after = await second.ReadAsync();
        Assert.Equal(connectionId, before.Partition);
        Assert.Equal(before.Partition, after.Partition);
        Assert.Equal(WebSocketState.Open, socket.State);

        static async Task SendAsync(WebSocket socket, int id)
        {
            var payload = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { type = "event", @event = "message", ackId = id, dataType = "text", data = "hello" }));
            await socket.SendAsync(payload, WebSocketMessageType.Text, true, CancellationToken.None).WaitAsync(Timeout);
            using var ack = await ReceiveAsync(socket);
            Assert.Equal(id, ack.RootElement.GetProperty("ackId").GetInt32());
            Assert.True(ack.RootElement.GetProperty("success").GetBoolean());
        }
        static async Task<JsonDocument> ReceiveAsync(WebSocket socket)
        {
            var buffer = new byte[4096];
            var result = await socket.ReceiveAsync(buffer, CancellationToken.None).WaitAsync(Timeout);
            Assert.Equal(WebSocketMessageType.Text, result.MessageType);
            return JsonDocument.Parse(buffer.AsMemory(0, result.Count));
        }
    }

    private static string Settings(string? target, string pattern = "message", string[]? systemEvents = null, string handlerPath = "/original") =>
        JsonSerializer.Serialize(new { WebPubSub = new { Hubs = new Dictionary<string, HubOptions>
        {
            ["chat"] = new()
            {
                EventHandlers = [new() { UrlTemplate = "http://localhost:1" + handlerPath, EventPattern = "handler-only" }],
                EventListeners = target is null ? [] : [new()
                {
                    EventHubEndpoint = new() { FullyQualifiedNamespace = "local.test", EventHubName = target },
                    EventNameFilter = new() { UserEventPattern = pattern, SystemEvents = systemEvents ?? [] },
                }],
            },
        } } });

    private sealed class ReloadLogger : ILogger<HubSettingsConfiguration>
    {
        public Channel<LogLevel> Notices { get; } = Channel.CreateUnbounded<LogLevel>();
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter) => Notices.Writer.TryWrite(logLevel);
    }

    private sealed class Fixture(string directory, WebApplication app, ReloadLogger logger) : IAsyncDisposable
    {
        public WebApplication App => app;
        public int Creations { get; private set; }
        public HubSettingsConfiguration Configuration => app.Services.GetRequiredService<HubSettingsConfiguration>();
        public EventHubNotifier Notifier => app.Services.GetRequiredService<EventHubNotifier>();
        public Task<bool> SendAsync(string name = "message", bool userEvent = true) => Notifier.TryNotifyAsync(
            new("connection", "chat", null, null, "localhost"), name, 1, new(MessageDataType.Text, "hello"u8.ToArray()), userEvent);

        public async Task WriteAsync(string json, LogLevel expected = LogLevel.Information)
        {
            while (logger.Notices.Reader.TryRead(out _)) { }
            var temporary = Path.Combine(directory, "next.json");
            await File.WriteAllTextAsync(temporary, json);
            File.Move(temporary, Path.Combine(directory, "appsettings.json"), overwrite: true);
            Assert.Equal(expected, await logger.Notices.Reader.ReadAsync().AsTask().WaitAsync(Timeout));
        }

        public static async Task<Fixture> StartAsync(Func<EventHubEndpointOptions, RecordingProducer> create)
        {
            var directory = Path.Combine(Path.GetTempPath(), "awps-listener-reload-" + Guid.NewGuid());
            Directory.CreateDirectory(directory);
            await File.WriteAllTextAsync(Path.Combine(directory, "appsettings.json"), Settings("first"));
            var builder = EmulatorApplication.CreateBuilder(["--contentRoot=" + directory]);
            builder.WebHost.UseTestServer();
            builder.Logging.ClearProviders();
            var logger = new ReloadLogger();
            builder.Services.AddSingleton<ILogger<HubSettingsConfiguration>>(logger);
            Fixture? fixture = null;
            builder.Services.AddSingleton<Func<EventHubEndpointOptions, EventHubProducerClient>>(_ => endpoint =>
            {
                fixture!.Creations++;
                return create(endpoint);
            });
            var app = EmulatorApplication.Build(builder);
            fixture = new Fixture(directory, app, logger);
            await app.StartAsync().WaitAsync(Timeout);
            return fixture;
        }

        public async ValueTask DisposeAsync()
        {
            await app.DisposeAsync();
            Directory.Delete(directory, recursive: true);
        }
    }
}
