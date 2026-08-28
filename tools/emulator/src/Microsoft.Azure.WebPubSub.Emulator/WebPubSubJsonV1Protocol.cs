// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal abstract record WebPubSubClientRequest(ulong? AckId);

internal sealed record WebPubSubClientJoinGroupRequest(
    string Group,
    ulong? AckId) : WebPubSubClientRequest(AckId);

internal sealed record WebPubSubClientLeaveGroupRequest(
    string Group,
    ulong? AckId) : WebPubSubClientRequest(AckId);

internal sealed record WebPubSubClientSendToGroupRequest(
    string Group,
    MessageData Data,
    bool NoEcho,
    uint TtlSeconds,
    ulong? AckId) : WebPubSubClientRequest(AckId);

internal sealed record WebPubSubClientSendEventRequest(
    string EventName,
    MessageData Data,
    ulong? AckId) : WebPubSubClientRequest(AckId);

internal sealed record WebPubSubClientPingRequest() :
    WebPubSubClientRequest((ulong?)null);

internal sealed record WebPubSubClientSequenceAckRequest(ulong SequenceId) :
    WebPubSubClientRequest((ulong?)null);

internal enum WebPubSubAckErrorName
{
    BadRequest,
    Forbidden,
    InternalServerError,
    Duplicate,
}

internal sealed partial class WebPubSubJsonV1Protocol
{
    private const int MaximumMessageTtlSeconds = 300;
    private const int MaximumMetadataBytes = 8 * 1024;
    private const int MaximumMetadataKeyBytes = 256;
    private const int MaximumMetadataValueBytes = 1024;

    public WebPubSubClientRequest ParseMessage(byte[] payload)
    {
        try
        {
            using var document = JsonDocument.Parse(payload);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
            {
                throw new InvalidDataException("Expected a JSON object.");
            }

            var type = GetRequiredString(root, "type");
            var ackId = GetOptionalUInt64(root, "ackId");
            if (type.Equals("ping", StringComparison.OrdinalIgnoreCase))
            {
                return new WebPubSubClientPingRequest();
            }

            if (type.Equals("sequenceAck", StringComparison.OrdinalIgnoreCase))
            {
                return new WebPubSubClientSequenceAckRequest(
                    GetRequiredUInt64(root, "sequenceId"));
            }

            if (type.Equals("joinGroup", StringComparison.OrdinalIgnoreCase))
            {
                return new WebPubSubClientJoinGroupRequest(
                    GetRequiredGroup(root),
                    ackId);
            }

            if (type.Equals("leaveGroup", StringComparison.OrdinalIgnoreCase))
            {
                return new WebPubSubClientLeaveGroupRequest(
                    GetRequiredGroup(root),
                    ackId);
            }

            if (type.Equals("sendToGroup", StringComparison.OrdinalIgnoreCase))
            {
                var metadata = ReadMetadata(root);
                return new WebPubSubClientSendToGroupRequest(
                    GetRequiredGroup(root),
                    ReadData(root, metadata),
                    GetOptionalBoolean(root, "noEcho"),
                    GetMessageTtl(root),
                    ackId);
            }

            if (type.Equals("event", StringComparison.OrdinalIgnoreCase))
            {
                var eventName = GetRequiredString(root, "event");
                if (!WebPubSubNameValidator.IsValidEventName(eventName))
                {
                    throw new InvalidDataException("The event name is invalid.");
                }

                var metadata = ReadMetadata(root);
                return new WebPubSubClientSendEventRequest(
                    eventName,
                    ReadData(root, metadata),
                    ackId);
            }

            throw new InvalidDataException($"Unknown 'type': {type}.");
        }
        catch (JsonException exception)
        {
            throw new InvalidDataException("Error reading JSON.", exception);
        }
    }

    public WebSocketPayload WriteConnected(LogicalConnection connection)
    {
        return WriteJson(writer =>
        {
            writer.WriteStartObject();
            writer.WriteString("type", "system");
            writer.WriteString("event", "connected");
            writer.WriteString("userId", connection.UserId);
            writer.WriteString("connectionId", connection.ConnectionId);
            writer.WriteEndObject();
        });
    }

    public WebSocketPayload WritePong()
    {
        return WriteJson(writer =>
        {
            writer.WriteStartObject();
            writer.WriteString("type", "pong");
            writer.WriteEndObject();
        });
    }

    public WebSocketPayload WriteAck(ulong ackId)
    {
        return WriteJson(writer =>
        {
            writer.WriteStartObject();
            writer.WriteString("type", "ack");
            writer.WriteNumber("ackId", ackId);
            writer.WriteBoolean("success", true);
            writer.WriteEndObject();
        });
    }

    public WebSocketPayload WriteErrorAck(
        ulong ackId,
        WebPubSubAckErrorName errorName,
        string message)
    {
        return WriteJson(writer =>
        {
            writer.WriteStartObject();
            writer.WriteString("type", "ack");
            writer.WriteNumber("ackId", ackId);
            writer.WriteBoolean("success", false);
            writer.WriteStartObject("error");
            writer.WriteString("name", errorName.ToString());
            writer.WriteString("message", message);
            writer.WriteEndObject();
            writer.WriteEndObject();
        });
    }

    public WebSocketPayload WriteGroupData(
        string group,
        string? fromUserId,
        MessageData data)
    {
        return WriteJson(writer =>
        {
            writer.WriteStartObject();
            writer.WriteString("type", "message");
            writer.WriteString("from", "group");
            writer.WriteString("group", group);
            writer.WriteString("fromUserId", fromUserId);
            WriteData(writer, data);
            writer.WriteEndObject();
        });
    }

    public WebSocketPayload WriteServerData(MessageData data)
    {
        return WriteJson(writer =>
        {
            writer.WriteStartObject();
            writer.WriteString("type", "message");
            writer.WriteString("from", "server");
            WriteData(writer, data);
            writer.WriteEndObject();
        });
    }

    private static MessageData ReadData(
        JsonElement root,
        IReadOnlyDictionary<string, string>? metadata)
    {
        if (!root.TryGetProperty("data", out var data))
        {
            if (metadata is not null)
            {
                return new MessageData(MessageDataType.Text, ReadOnlyMemory<byte>.Empty, metadata);
            }

            throw new InvalidDataException("Missing required property 'data'.");
        }

        var dataType = root.TryGetProperty("dataType", out var dataTypeElement)
            ? GetString(dataTypeElement, "dataType")
            : "json";
        if (dataType.Equals("text", StringComparison.OrdinalIgnoreCase))
        {
            if (data.ValueKind != JsonValueKind.String)
            {
                throw new InvalidDataException("'data' should be a string when 'dataType' is 'text'.");
            }

            return new MessageData(
                MessageDataType.Text,
                Encoding.UTF8.GetBytes(data.GetString()!),
                metadata);
        }

        if (dataType.Equals("binary", StringComparison.OrdinalIgnoreCase))
        {
            if (data.ValueKind != JsonValueKind.String ||
                !data.TryGetBytesFromBase64(out var bytes))
            {
                throw new InvalidDataException("'data' is not a valid base64 encoded string.");
            }

            return new MessageData(MessageDataType.Binary, bytes, metadata);
        }

        if (!dataType.Equals("json", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidDataException($"Unknown 'dataType': {dataType}.");
        }

        if (data.ValueKind == JsonValueKind.Null)
        {
            throw new InvalidDataException("Invalid value for 'data': null.");
        }

        return new MessageData(
            MessageDataType.Json,
            Encoding.UTF8.GetBytes(data.GetRawText()),
            metadata);
    }

    private static IReadOnlyDictionary<string, string>? ReadMetadata(JsonElement root)
    {
        if (!root.TryGetProperty("metadata", out var metadata) ||
            metadata.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        if (metadata.ValueKind != JsonValueKind.Object)
        {
            throw new InvalidDataException("'metadata' must be a JSON object.");
        }

        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        var totalBytes = 0;
        foreach (var property in metadata.EnumerateObject())
        {
            if (property.Value.ValueKind != JsonValueKind.String)
            {
                throw new InvalidDataException(
                    $"Metadata value for key '{property.Name}' must be a string.");
            }

            var value = property.Value.GetString()!;
            if (!MetadataKeyRegex().IsMatch(property.Name))
            {
                throw new InvalidDataException(
                    $"Metadata key '{property.Name}' contains invalid characters.");
            }
            if (!property.Name.All(character => character <= 0x7f) ||
                !value.All(character => character <= 0x7f))
            {
                throw new InvalidDataException("Metadata keys and values must be ASCII.");
            }
            if (property.Name.Length > MaximumMetadataKeyBytes)
            {
                throw new InvalidDataException(
                    $"Metadata key '{property.Name}' exceeds {MaximumMetadataKeyBytes} bytes.");
            }
            if (value.Length > MaximumMetadataValueBytes)
            {
                throw new InvalidDataException(
                    $"Metadata value for key '{property.Name}' exceeds {MaximumMetadataValueBytes} bytes.");
            }

            totalBytes += property.Name.Length + value.Length;
            if (totalBytes > MaximumMetadataBytes)
            {
                throw new InvalidDataException($"Metadata exceeds {MaximumMetadataBytes} bytes.");
            }
            if (!result.TryAdd(property.Name, value))
            {
                throw new InvalidDataException(
                    $"Duplicate key '{property.Name}' found within 'metadata'.");
            }
        }

        return result;
    }

    private static void WriteData(Utf8JsonWriter writer, MessageData data)
    {
        writer.WriteString("dataType", data.Type.ToString().ToLowerInvariant());
        switch (data.Type)
        {
            case MessageDataType.Text:
                writer.WriteString("data", Encoding.UTF8.GetString(data.Bytes.Span));
                break;
            case MessageDataType.Binary:
                writer.WriteBase64String("data", data.Bytes.Span);
                break;
            case MessageDataType.Json:
                writer.WritePropertyName("data");
                writer.WriteRawValue(data.Bytes.Span);
                break;
            default:
                throw new InvalidOperationException($"Unknown message data type '{data.Type}'.");
        }

        if (data.Metadata is not null)
        {
            writer.WriteStartObject("metadata");
            foreach (var item in data.Metadata)
            {
                writer.WriteString(item.Key, item.Value);
            }
            writer.WriteEndObject();
        }
    }

    private static WebSocketPayload WriteJson(Action<Utf8JsonWriter> write)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            write(writer);
        }
        return new WebSocketPayload(stream.ToArray(), WebSocketMessageType.Text);
    }

    private static string GetRequiredGroup(JsonElement root)
    {
        var group = GetRequiredString(root, "group");
        if (!WebPubSubNameValidator.IsValidGroupName(group))
        {
            throw new InvalidDataException("The group name is invalid.");
        }
        return group;
    }

    private static string GetRequiredString(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var value))
        {
            throw new InvalidDataException($"Missing required property '{propertyName}'.");
        }
        return GetString(value, propertyName);
    }

    private static string GetString(JsonElement value, string propertyName)
    {
        if (value.ValueKind != JsonValueKind.String)
        {
            throw new InvalidDataException($"Expected '{propertyName}' to be a string.");
        }
        return value.GetString()!;
    }

    private static ulong? GetOptionalUInt64(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var value) ||
            value.ValueKind == JsonValueKind.Null)
        {
            return null;
        }
        if (value.ValueKind != JsonValueKind.Number || !value.TryGetUInt64(out var result))
        {
            throw new InvalidDataException($"'{propertyName}' is not a valid uint64 value.");
        }
        return result;
    }

    private static ulong GetRequiredUInt64(JsonElement root, string propertyName)
    {
        return GetOptionalUInt64(root, propertyName) ??
            throw new InvalidDataException($"Missing required property '{propertyName}'.");
    }

    private static bool GetOptionalBoolean(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var value))
        {
            return false;
        }
        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => throw new InvalidDataException($"Expected '{propertyName}' to be a boolean."),
        };
    }

    private static uint GetMessageTtl(JsonElement root)
    {
        if (!root.TryGetProperty("ttlSeconds", out var value) ||
            value.ValueKind == JsonValueKind.Null)
        {
            return 0;
        }
        if (value.ValueKind != JsonValueKind.Number ||
            !value.TryGetUInt32(out var result) ||
            result > MaximumMessageTtlSeconds)
        {
            throw new InvalidDataException(
                "'ttlSeconds' is out of range. Allowed range is [0,300].");
        }
        return result;
    }

    [GeneratedRegex("^[!#$%&'*+\\-.^_`|~0-9a-z]+$", RegexOptions.IgnoreCase)]
    private static partial Regex MetadataKeyRegex();
}
