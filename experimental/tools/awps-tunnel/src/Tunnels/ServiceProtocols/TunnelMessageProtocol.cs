using System;
using System.Buffers;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.IO;
using System.Net.Http;

using Newtonsoft.Json;

#nullable enable
public class TunnelMessageProtocol : IMessageProtocol<TunnelMessage>
{
    public static readonly TunnelMessageProtocol Instance = new();

    public bool TryParseResponseMessage(ReadOnlyMemory<byte> data, out TunnelResponseMessage? message)
    {
        var buffer = new ReadOnlySequence<byte>(data);
        if (TryParse(ref buffer, out var tm) && tm is TunnelResponseMessage rm)
        {
            message = rm;
            return true;
        }

        message = null;
        return false;
    }

    public bool TryParseRequestMessage(ReadOnlyMemory<byte> data, [NotNullWhen(true)] out TunnelRequestMessage? message)
    {
        var buffer = new ReadOnlySequence<byte>(data);
        if (TryParse(ref buffer, out var tm) && tm is TunnelRequestMessage rm)
        {
            message = rm;
            return true;
        }

        message = null;
        return false;
    }

    public bool TryParse(ref ReadOnlySequence<byte> buffer, [NotNullWhen(true)] out TunnelMessage? message)
    {
        if (buffer.Length <= 4)
        {
            message = null;
            return false;
        }

        var length = ReadLength(ref buffer);
        if (buffer.Length < length + 4)
        {
            message = null;
            return false;
        }

        var content = buffer.Slice(4, length).AsStream();
        buffer = buffer.Slice(length + 4);
        try
        {
            message = Parse(content, false);
            return message != null;
        }
        catch (Exception)
        {
            message = null;
            return false;
        }

        static int ReadLength(ref ReadOnlySequence<byte> buffer)
        {
            if (buffer.FirstSpan.Length > 4)
            {
                return BitConverter.ToInt32(buffer.FirstSpan[0..4]);
            }
            else
            {
                Span<byte> copy = stackalloc byte[4];
                buffer.Slice(0, 4).CopyTo(copy);
                return BitConverter.ToInt32(copy);
            }
        }
    }

    public void Write(TunnelMessage message, IBufferWriter<byte> writer)
    {
        WriteMessage(message, writer);
    }

    public static int WriteMessage(TunnelMessage message, IBufferWriter<byte> writer)
    {
        var m = writer.GetMemory(4);
        writer.Advance(4);
        var stream = writer.AsStream();
        WriteMessage(stream, message);
        var length = (int)stream.Length;
        BitConverter.TryWriteBytes(m.Span, length);
        return length + 4;
    }

    private static TunnelMessage? Parse(Stream stream, bool throwOnError)
    {
        var reader = MessagePackReader.Create(stream)
            .Array()
            .Int(out var type)
            .Text(out var json)
            .Optional<byte[]>((r, box) => r.Simple().Value(out box.Value), out var content);
        switch ((TunnelMessageType)type)
        {
            case TunnelMessageType.HttpRequest:
                {
                    var message = JsonConvert.DeserializeObject<TunnelRequestMessage>(json);
                    message!.Content = content;
                    return message;
                }
            case TunnelMessageType.HttpResponse:
                {
                    var message = JsonConvert.DeserializeObject<TunnelResponseMessage>(json);
                    message!.Content = content;
                    return message;
                }
            case TunnelMessageType.ServiceStatus:
                {
                    return JsonConvert.DeserializeObject<ServiceStatusTunnelMessage>(json);
                }
            case TunnelMessageType.ConnectionReconnectCommand:
                {
                    return JsonConvert.DeserializeObject<ServiceReconnectTunnelMessage>(json);
                }
            case TunnelMessageType.ConnectionCloseCommand:
                {
                    return JsonConvert.DeserializeObject<ConnectionCloseTunnelMessage>(json);
                }
            default:
                if (throwOnError)
                {
                    throw new NotSupportedException($"Message with type:{type} is not supported");
                }
                return null;
        }
    }

    private static void WriteMessage(Stream stream, TunnelMessage message)
    {
        var content = (message as ByteContentTunnelMessage)?.Content;
        var length = content != null ? 3 : 2;
        MessagePackWriter.Create(stream)
            .Array(length)
            .Int((int)message.Type)
            .Text(JsonConvert.SerializeObject(message))
            .When(content != null).Simple().Value(content)
            .EndArray()
            .Terminate();
    }
}

#nullable restore
