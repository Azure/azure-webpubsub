// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Collections.Concurrent;
using Azure.Core;
using Azure.Messaging.EventHubs;
using Azure.Messaging.EventHubs.Producer;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal interface IEventHubPublisher
{
    Task PublishAsync(
        UpstreamEvent upstreamEvent,
        EventHubEndpointOptions endpoint,
        CancellationToken cancellationToken);
}

internal sealed class EventHubPublisher(TokenCredential credential) :
    IEventHubPublisher,
    IAsyncDisposable
{
    private readonly ConcurrentDictionary<EventHubEndpointOptions, EventHubProducerClient> _producers = [];

    public async Task PublishAsync(
        UpstreamEvent upstreamEvent,
        EventHubEndpointOptions endpoint,
        CancellationToken cancellationToken)
    {
        var producer = _producers.GetOrAdd(endpoint, target =>
            new EventHubProducerClient(
                target.FullyQualifiedNamespace,
                target.EventHubName,
                credential));
        var (eventData, sendOptions) = CreateMessage(upstreamEvent);

        await producer.SendAsync(
            [eventData],
            sendOptions,
            cancellationToken);
    }

    internal static (EventData EventData, SendEventOptions SendOptions) CreateMessage(
        UpstreamEvent upstreamEvent)
    {
        var eventData = new EventData(upstreamEvent.Data.Bytes)
        {
            ContentType = GetContentType(upstreamEvent.Data.Type),
            MessageId = $"{upstreamEvent.ConnectionId}/{upstreamEvent.Id}",
        };

        eventData.Properties["cloudEvents:specversion"] = "1.0";
        eventData.Properties["cloudEvents:type"] = upstreamEvent.Type;
        eventData.Properties["cloudEvents:source"] = upstreamEvent.Source;
        eventData.Properties["cloudEvents:id"] = upstreamEvent.Id.ToString();
        eventData.Properties["cloudEvents:awpsversion"] = "1.0";
        eventData.Properties["cloudEvents:hub"] = upstreamEvent.Hub;
        eventData.Properties["cloudEvents:eventname"] = upstreamEvent.EventName;
        eventData.Properties["cloudEvents:connectionid"] = upstreamEvent.ConnectionId;
        eventData.Properties["cloudEvents:time"] = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ");
        SetIfNotEmpty(eventData.Properties, "cloudEvents:userid", upstreamEvent.UserId);
        SetIfNotEmpty(eventData.Properties, "cloudEvents:subprotocol", upstreamEvent.Subprotocol);
        SetIfNotEmpty(eventData.Properties, "cloudEvents:connectionstate", upstreamEvent.ConnectionState);

        return (
            eventData,
            new SendEventOptions { PartitionKey = upstreamEvent.ConnectionId });
    }

    public async ValueTask DisposeAsync()
    {
        foreach (var producer in _producers.Values)
        {
            await producer.DisposeAsync();
        }
        _producers.Clear();
    }

    private static string GetContentType(MessageDataType dataType)
    {
        return dataType switch
        {
            MessageDataType.Text => "text/plain",
            MessageDataType.Binary => "application/octet-stream",
            MessageDataType.Json => "application/json",
            _ => throw new InvalidOperationException($"Unsupported data type '{dataType}'."),
        };
    }

    private static void SetIfNotEmpty(
        IDictionary<string, object> properties,
        string name,
        string? value)
    {
        if (!string.IsNullOrEmpty(value))
        {
            properties[name] = value;
        }
    }
}