// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System.Buffers;
using System.Text;
using System.Text.Json;

namespace Microsoft.Azure.WebPubSub.Emulator;

internal static class WebPubSubJsonProtocol
{
    public const string JsonSubprotocol = "json.webpubsub.azure.v1";
    public const string ReliableJsonSubprotocol = "json.reliable.webpubsub.azure.v1";

    public static ClientMessage Parse(ReadOnlyMemory<byte> payload)
    {
        using var document = JsonDocument.Parse(payload);
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object)
        {
            throw new InvalidDataException("A Web PubSub message must be a JSON object.");
        }

        var type = GetRequiredString(root, "type");
        var ackId = TryGetUInt64(root, "ackId");

        return type switch
        {
            "joinGroup" => new JoinGroupMessage(GetRequiredString(root, "group"), ackId),
            "leaveGroup" => new LeaveGroupMessage(GetRequiredString(root, "group"), ackId),
            "sendToGroup" => new SendToGroupMessage(
                GetRequiredString(root, "group"),
                ReadData(root),
                GetOptionalBoolean(root, "noEcho"),
                GetOptionalUInt32(root, "ttlSeconds", 0, 300),
                ackId),
            "event" => new EventMessage(GetRequiredString(root, "event"), ReadData(root), ackId),
            "sequenceAck" => new SequenceAckMessage(GetRequiredUInt64(root, "sequenceId")),
            "ping" => new PingMessage(),
            _ => throw new InvalidDataException($"Unsupported Web PubSub message type '{type}'."),
        };
    }

    public static byte[] WriteConnected(string? userId, string connectionId, string? reconnectionToken)
    {
        return Write(writer =>
        {
            writer.WriteString("type", "system");
            writer.WriteString("event", "connected");
            writer.WriteString("userId", userId ?? string.Empty);
            writer.WriteString("connectionId", connectionId);
            if (reconnectionToken is not null)
            {
                writer.WriteString("reconnectionToken", reconnectionToken);
            }
        });
    }

    public static byte[] WriteDisconnected(string message)
    {
        return Write(writer =>
        {
            writer.WriteString("type", "system");
            writer.WriteString("event", "disconnected");
            writer.WriteString("message", message);
        });
    }

    public static byte[] WriteAck(ulong ackId)
    {
        return Write(writer =>
        {
            writer.WriteString("type", "ack");
            writer.WriteNumber("ackId", ackId);
            writer.WriteBoolean("success", true);
        });
    }

    public static byte[] WriteErrorAck(ulong ackId, string name, string message)
    {
        return Write(writer =>
        {
            writer.WriteString("type", "ack");
            writer.WriteNumber("ackId", ackId);
            writer.WriteBoolean("success", false);
            writer.WriteStartObject("error");
            writer.WriteString("name", name);
            writer.WriteString("message", message);
            writer.WriteEndObject();
        });
    }

    public static byte[] WritePong()
    {
        return Write(writer => writer.WriteString("type", "pong"));
    }

    public static byte[] WriteGroupData(
        string group,
        string? fromUserId,
        MessageData data,
        ulong? sequenceId)
    {
        return Write(writer =>
        {
            WriteSequenceId(writer, sequenceId);
            writer.WriteString("type", "message");
            writer.WriteString("from", "group");
            writer.WriteString("group", group);
            if (fromUserId is not null)
            {
                writer.WriteString("fromUserId", fromUserId);
            }
            WriteData(writer, data);
        });
    }

    public static byte[] WriteServerData(MessageData data, ulong? sequenceId)
    {
        return Write(writer =>
        {
            WriteSequenceId(writer, sequenceId);
            writer.WriteString("type", "message");
            writer.WriteString("from", "server");
            WriteData(writer, data);
        });
    }

    private static MessageData ReadData(JsonElement root)
    {
        var metadata = ReadMetadata(root);
        if (!root.TryGetProperty("data", out var data))
        {
            return metadata is not null
                ? new MessageData(MessageDataType.Text, [], metadata)
                : throw new InvalidDataException("Missing required property 'data'.");
        }

        string? dataType = "json";
        if (root.TryGetProperty("dataType", out var value))
        {
            if (value.ValueKind != JsonValueKind.String)
            {
                throw new InvalidDataException("Invalid property 'dataType'.");
            }

            dataType = value.GetString();
        }

        return dataType?.ToUpperInvariant() switch
        {
            "TEXT" when data.ValueKind == JsonValueKind.String =>
                new MessageData(MessageDataType.Text, Encoding.UTF8.GetBytes(data.GetString()!), metadata),
            "BINARY" when data.ValueKind == JsonValueKind.String =>
                new MessageData(MessageDataType.Binary, ReadBase64(data), metadata),
            "JSON" =>
                new MessageData(MessageDataType.Json, Encoding.UTF8.GetBytes(data.GetRawText()), metadata),
            _ => throw new InvalidDataException($"Invalid data for dataType '{dataType}'."),
        };
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
            throw new InvalidDataException("Property 'metadata' must be a JSON object.");
        }

        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var property in metadata.EnumerateObject())
        {
            if (property.Value.ValueKind != JsonValueKind.String)
            {
                throw new InvalidDataException(
                    $"Metadata value for key '{property.Name}' must be a string.");
            }
            result[property.Name] = property.Value.GetString()!;
        }
        WebPubSubMetadata.Validate(result);
        return result;
    }

    private static byte[] ReadBase64(JsonElement data)
    {
        if (!data.TryGetBytesFromBase64(out var bytes) || bytes is null)
        {
            throw new InvalidDataException("Property 'data' is not valid base64 content.");
        }

        return bytes;
    }

    private static void WriteData(Utf8JsonWriter writer, MessageData data)
    {
        writer.WriteString("dataType", data.Type switch
        {
            MessageDataType.Text => "text",
            MessageDataType.Binary => "binary",
            MessageDataType.Json => "json",
            _ => throw new InvalidOperationException($"Unsupported data type '{data.Type}'."),
        });

        writer.WritePropertyName("data");
        switch (data.Type)
        {
            case MessageDataType.Text:
                writer.WriteStringValue(Encoding.UTF8.GetString(data.Bytes));
                break;
            case MessageDataType.Binary:
                writer.WriteBase64StringValue(data.Bytes);
                break;
            case MessageDataType.Json:
                writer.WriteRawValue(data.Bytes, skipInputValidation: false);
                break;
            default:
                throw new InvalidOperationException($"Unsupported data type '{data.Type}'.");
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

    private static byte[] Write(Action<Utf8JsonWriter> writeProperties)
    {
        var buffer = new ArrayBufferWriter<byte>();
        using var writer = new Utf8JsonWriter(buffer);
        writer.WriteStartObject();
        writeProperties(writer);
        writer.WriteEndObject();
        writer.Flush();
        return buffer.WrittenSpan.ToArray();
    }

    private static void WriteSequenceId(Utf8JsonWriter writer, ulong? sequenceId)
    {
        if (sequenceId.HasValue)
        {
            writer.WriteNumber("sequenceId", sequenceId.Value);
        }
    }

    private static string GetRequiredString(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.String)
        {
            throw new InvalidDataException($"Missing or invalid property '{name}'.");
        }

        return value.GetString()!;
    }

    private static ulong GetRequiredUInt64(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var value) ||
            value.ValueKind != JsonValueKind.Number ||
            !value.TryGetUInt64(out var result))
        {
            throw new InvalidDataException($"Missing or invalid property '{name}'.");
        }

        return result;
    }

    private static ulong? TryGetUInt64(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.Null)
        {
            return null;
        }

        if (value.ValueKind != JsonValueKind.Number || !value.TryGetUInt64(out var result))
        {
            throw new InvalidDataException($"Invalid property '{name}'.");
        }

        return result;
    }

    private static bool GetOptionalBoolean(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.Null)
        {
            return false;
        }

        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => throw new InvalidDataException($"Invalid property '{name}'."),
        };
    }

    private static uint GetOptionalUInt32(
        JsonElement root,
        string name,
        uint defaultValue,
        uint maximum)
    {
        if (!root.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.Null)
        {
            return defaultValue;
        }

        if (value.ValueKind != JsonValueKind.Number ||
            !value.TryGetUInt32(out var result) ||
            result > maximum)
        {
            throw new InvalidDataException(
                $"Property '{name}' is out of range. Allowed range is [0,{maximum}].");
        }

        return result;
    }
}

internal enum MessageDataType
{
    Text,
    Binary,
    Json,
}

internal sealed record MessageData(
    MessageDataType Type,
    byte[] Bytes,
    IReadOnlyDictionary<string, string>? Metadata = null);

internal abstract record ClientMessage;

internal sealed record JoinGroupMessage(string Group, ulong? AckId) : ClientMessage;

internal sealed record LeaveGroupMessage(string Group, ulong? AckId) : ClientMessage;

internal sealed record SendToGroupMessage(
    string Group,
    MessageData Data,
    bool NoEcho,
    uint TtlSeconds,
    ulong? AckId) : ClientMessage;

internal sealed record EventMessage(string Event, MessageData Data, ulong? AckId) : ClientMessage;

internal sealed record SequenceAckMessage(ulong SequenceId) : ClientMessage;

internal sealed record PingMessage : ClientMessage;
