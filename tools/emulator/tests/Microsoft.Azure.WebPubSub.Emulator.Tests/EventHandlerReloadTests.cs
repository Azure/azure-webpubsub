// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.IO;
using System.Linq;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace Microsoft.Azure.WebPubSub.Emulator.Tests;

public class EventHandlerReloadTests
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(15);

    [Fact]
    public async Task FileChangesUpdateRoutingAndPatternsWithoutReconnecting()
    {
        await using var fixture = await Fixture.StartAsync();
        using var socket = await fixture.ConnectAsync();
        await fixture.SendAsync(socket, "message", "/first");
        await fixture.WriteAsync(fixture.Json("/second", "updated", ["disconnected"]));
        await fixture.SendAsync(socket, "message", null);
        await fixture.SendAsync(socket, "updated", "/second");
        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", CancellationToken.None).WaitAsync(Timeout);
        var disconnected = await fixture.SystemEvents.Reader.ReadAsync().AsTask().WaitAsync(Timeout);
        Assert.Equal(("/second", "azure.webpubsub.sys.disconnected"), disconnected);
    }

    [Fact]
    public async Task RemovingAndAddingHandlerKeepsExistingConnection()
    {
        await using var fixture = await Fixture.StartAsync();
        using var socket = await fixture.ConnectAsync();
        await fixture.WriteAsync("{\"WebPubSub\":{\"Hubs\":{}}}");
        await fixture.SendAsync(socket, "message", null);
        await fixture.WriteAsync(fixture.Json("/added", "*", []));
        await fixture.SendAsync(socket, "message", "/added");
    }

    [Theory]
    [InlineData("invalidType")]
    [InlineData("url")]
    [InlineData("pattern")]
    [InlineData("systemEvent")]
    [InlineData("unknownProperty")]
    public async Task InvalidEditRetainsLastGoodConfigurationAndCanRecover(string invalid)
    {
        await using var fixture = await Fixture.StartAsync();
        using var socket = await fixture.ConnectAsync();
        var json = invalid switch
        {
            "invalidType" => fixture.Json("/wrong", "message", []).Replace("\"Hubs\":", "\"AllowUnvalidatedEntraTokens\":\"not-a-boolean\",\"Hubs\":"),
            "url" => fixture.Json("/wrong", "message", []).Replace("http://", "ftp://"),
            "pattern" => fixture.Json("/wrong", "room.*", []),
            "systemEvent" => fixture.Json("/wrong", "message", ["not-a-system-event"]),
            _ => fixture.Json("/wrong", "message", []).Replace("\"EventPattern\":", "\"Unsupported\":true,\"EventPattern\":"),
        };
        await fixture.WriteAsync(json, LogLevel.Warning);
        await fixture.SendAsync(socket, "message", "/first");
        await fixture.WriteAsync(fixture.Json("/recovered", "message", []));
        await fixture.SendAsync(socket, "message", "/recovered");
    }

    [Theory]
    [InlineData("{\"WebPubSub\":{\"Hubs\":{\"chat\":null}}}")]
    [InlineData("{\"WebPubSub\":{\"Hubs\":{\"chat\":{\"EventHandlers\":null}}}}")]
    public async Task NullHandlerConfigurationClearsHandlers(string json)
    {
        await using var fixture = await Fixture.StartAsync();
        using var socket = await fixture.ConnectAsync();
        await fixture.WriteAsync(json);
        await fixture.SendAsync(socket, "message", null);
        await fixture.WriteAsync(fixture.Json("/restored", "message", []));
        await fixture.SendAsync(socket, "message", "/restored");
    }

    [Fact]
    public async Task RejectedOptionsDoNotNotifyOrReplaceAppliedSettings()
    {
        await using var fixture = await Fixture.StartAsync();
        using var socket = await fixture.ConnectAsync();
        var monitor = fixture.App.Services.GetRequiredService<IOptionsMonitor<EmulatorOptions>>();
        var applied = fixture.App.Services.GetRequiredService<HubSettingsConfiguration>();
        var previous = applied.Current;
        var callbacks = 0;
        using var subscription = monitor.OnChange(_ => Interlocked.Increment(ref callbacks));
        await fixture.WriteAsync(fixture.Json("/wrong", "room.*", []), LogLevel.Warning);
        Assert.Throws<OptionsValidationException>(() => monitor.CurrentValue);
        Assert.Same(previous, applied.Current);
        Assert.Equal(0, callbacks);
        await fixture.SendAsync(socket, "message", "/first");
        await fixture.WriteAsync(fixture.Json("/fixed", "message", []));
        await fixture.SendAsync(socket, "message", "/fixed");
        Assert.NotSame(previous, applied.Current);
        Assert.True(callbacks > 0);
    }

    [Fact]
    public void MalformedJsonUsesFrameworkLoadErrors()
    {
        var directory = Path.Combine(Path.GetTempPath(), "awps-invalid-json-" + Guid.NewGuid());
        Directory.CreateDirectory(directory);
        try
        {
            File.WriteAllText(Path.Combine(directory, "appsettings.json"), "{broken");
            Assert.Throws<InvalidDataException>(() => EmulatorApplication.CreateBuilder(["--contentRoot=" + directory]));
        }
        finally { Directory.Delete(directory, recursive: true); }
    }

    [Fact]
    public async Task CommandLineOverridesFileAndStartupOptionsStayUnchanged()
    {
        await using var fixture = await Fixture.StartAsync(overridePattern: "override");
        using var socket = await fixture.ConnectAsync();
        await fixture.SendAsync(socket, "override", "/first");
        var initial = fixture.App.Services.GetRequiredService<IOptions<EmulatorOptions>>().Value;
        var changed = fixture.Json("/second", "file-only", [])
            .Replace("\"Hubs\":", "\"AccessKey\":\"another-local-development-access-key-123456\",\"Hubs\":");
        await fixture.WriteAsync(changed);
        Assert.Same(initial, fixture.App.Services.GetRequiredService<IOptions<EmulatorOptions>>().Value);
        Assert.Equal(EmulatorOptions.DefaultAccessKey, initial.AccessKey);
        await fixture.SendAsync(socket, "file-only", null);
        await fixture.SendAsync(socket, "override", "/second");
    }

    private sealed class ReloadLogger : ILogger<HubSettingsConfiguration>
    {
        public Channel<LogLevel> Notices { get; } = Channel.CreateUnbounded<LogLevel>();
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter) => Notices.Writer.TryWrite(logLevel);
    }

    private sealed class Fixture(string directory, WebApplication upstream, WebApplication app,
        ReloadLogger logger, Channel<(string, string)> systemEvents) : IAsyncDisposable
    {
        public WebApplication App => app;
        public Channel<(string, string)> SystemEvents => systemEvents;
        private int _ackId;

        public string Json(string path, string pattern, string[] events) => Settings(upstream.Urls.Single(), path, pattern, events);

        private static string Settings(string endpoint, string path, string pattern, string[] events) => JsonSerializer.Serialize(new
        {
            WebPubSub = new
            {
                Hubs = new Dictionary<string, object>
                {
                    ["chat"] = new { EventHandlers = new[] { new { UrlTemplate = endpoint + path, SystemEvents = events, EventPattern = pattern } } },
                },
            },
        });

        public async Task WriteAsync(string json, LogLevel expected = LogLevel.Information)
        {
            while (logger.Notices.Reader.TryRead(out _)) { }
            var temporary = Path.Combine(directory, "next.json");
            await File.WriteAllTextAsync(temporary, json);
            File.Move(temporary, Path.Combine(directory, "appsettings.json"), overwrite: true);
            Assert.Equal(expected, await logger.Notices.Reader.ReadAsync().AsTask().WaitAsync(Timeout));
        }

        public async Task<ClientWebSocket> ConnectAsync()
        {
            var audience = app.Urls.Single() + "/client/hubs/chat";
            var token = new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
                audience: audience, expires: DateTime.UtcNow.AddHours(1), signingCredentials: new SigningCredentials(
                    new SymmetricSecurityKey(Encoding.UTF8.GetBytes(EmulatorOptions.DefaultAccessKey)), SecurityAlgorithms.HmacSha256)));
            var socket = new ClientWebSocket();
            socket.Options.AddSubProtocol("json.webpubsub.azure.v1");
            await socket.ConnectAsync(new Uri(audience.Replace("http:", "ws:") + "?access_token=" + token), CancellationToken.None).WaitAsync(Timeout);
            using var connected = await ReceiveAsync(socket);
            Assert.Equal("connected", connected.RootElement.GetProperty("event").GetString());
            return socket;
        }

        public async Task SendAsync(ClientWebSocket socket, string name, string? responsePath)
        {
            var id = ++_ackId;
            var message = JsonSerializer.Serialize(new { type = "event", @event = name, ackId = id, dataType = "text", data = "hello" });
            await socket.SendAsync(Encoding.UTF8.GetBytes(message), WebSocketMessageType.Text, true, CancellationToken.None).WaitAsync(Timeout);
            if (responsePath is not null)
            {
                using var response = await ReceiveAsync(socket);
                Assert.Equal(responsePath, response.RootElement.GetProperty("data").GetString());
            }
            using var ack = await ReceiveAsync(socket);
            Assert.Equal("ack", ack.RootElement.GetProperty("type").GetString());
            Assert.Equal(id, ack.RootElement.GetProperty("ackId").GetInt32());
            Assert.Equal(responsePath is not null, ack.RootElement.GetProperty("success").GetBoolean());
        }

        private static async Task<JsonDocument> ReceiveAsync(ClientWebSocket socket)
        {
            var buffer = new byte[4096];
            var result = await socket.ReceiveAsync(buffer, CancellationToken.None).WaitAsync(Timeout);
            Assert.Equal(WebSocketMessageType.Text, result.MessageType);
            Assert.True(result.EndOfMessage);
            return JsonDocument.Parse(buffer.AsMemory(0, result.Count));
        }

        public static async Task<Fixture> StartAsync(string? overridePattern = null)
        {
            var directory = Path.Combine(Path.GetTempPath(), "awps-reload-" + Guid.NewGuid());
            Directory.CreateDirectory(directory);
            var builder = WebApplication.CreateBuilder(["--urls=http://127.0.0.1:0"]);
            builder.Logging.ClearProviders();
            var upstream = builder.Build();
            var events = Channel.CreateUnbounded<(string, string)>();
            upstream.Run(context =>
            {
                if (HttpMethods.IsOptions(context.Request.Method))
                {
                    context.Response.Headers["WebHook-Allowed-Origin"] = "*";
                    return Task.CompletedTask;
                }
                var type = context.Request.Headers["ce-type"].ToString();
                if (type.StartsWith("azure.webpubsub.sys.", StringComparison.Ordinal))
                {
                    events.Writer.TryWrite((context.Request.Path.Value!, type));
                    return Task.CompletedTask;
                }
                context.Response.ContentType = "text/plain";
                return context.Response.WriteAsync(context.Request.Path);
            });
            WebApplication? app = null;
            try
            {
                await upstream.StartAsync().WaitAsync(Timeout);
                var args = new List<string> { "--urls=http://127.0.0.1:0", "--contentRoot=" + directory };
                if (overridePattern is not null) args.Add("--WebPubSub:Hubs:chat:EventHandlers:0:EventPattern=" + overridePattern);
                var logger = new ReloadLogger();
                await File.WriteAllTextAsync(Path.Combine(directory, "appsettings.json"), Settings(upstream.Urls.Single(), "/first", "message", []));
                var emulator = EmulatorApplication.CreateBuilder(args.ToArray());
                emulator.Logging.ClearProviders();
                emulator.Services.AddSingleton<ILogger<HubSettingsConfiguration>>(logger);
                app = EmulatorApplication.Build(emulator);
                var fixture = new Fixture(directory, upstream, app, logger, events);
                await app.StartAsync().WaitAsync(Timeout);
                return fixture;
            }
            catch
            {
                if (app is not null) await app.DisposeAsync();
                await upstream.DisposeAsync();
                Directory.Delete(directory, recursive: true);
                throw;
            }
        }

        public async ValueTask DisposeAsync()
        {
            await app.DisposeAsync();
            await upstream.DisposeAsync();
            Directory.Delete(directory, recursive: true);
        }
    }
}
