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
    private const byte MessageLengthSize = 4;
    private const int MaxLength = 1024 * 1024; // 1M
    public static readonly TunnelMessageProtocol Instance = new();

    public ReadOnlyMemory<byte> GetBytes<T>(T message) where T : TunnelMessage
    {
        using var lease = MemoryBufferWriter.GetLocalLease();
        Write(message, lease.Writer);
        return lease.Writer.ToArray();
    }

    public bool TryParseResponseMessage(ReadOnlyMemory<byte> data, out TunnelHttpResponseMessage? message)
    {
        var buffer = new ReadOnlySequence<byte>(data);
        if (TryParse(ref buffer, out var tm) && tm is TunnelHttpResponseMessage rm)
        {
            message = rm;
            return true;
        }

        message = null;
        return false;
    }

    public bool TryParseRequestMessage(ReadOnlyMemory<byte> data, [NotNullWhen(true)] out TunnelHttpRequestMessage? message)
    {
        var buffer = new ReadOnlySequence<byte>(data);
        if (TryParse(ref buffer, out var tm) && tm is TunnelHttpRequestMessage rm)
        {
            message = rm;
            return true;
        }

        message = null;
        return false;
    }

    public bool TryParse(ref ReadOnlySequence<byte> buffer, [NotNullWhen(true)] out TunnelMessage? message)
    {
        if (TryParse(buffer, out message, out var offset))
        {
            buffer = buffer.Slice(offset);
            return true;
        }
        else
        {
            message = null;
            return false;
        }
    }

    public bool TryParse(ReadOnlySequence<byte> buffer, [NotNullWhen(true)] out TunnelMessage? message, out long parsedOffset)
    {
        message = null;
        parsedOffset = 0;
        if (buffer.Length <= MessageLengthSize)
        {
            return false;
        }

        var length = ReadLength(buffer);

        if (buffer.Length < length + MessageLengthSize)
        {
            return false;
        }

        var content = buffer.Slice(MessageLengthSize, length).AsStream();
        try
        {
            message = Parse(content, false);
            if (message != null)
            {
                parsedOffset = MessageLengthSize + length;
                return true;
            }
            else
            {
                return false;
            }
        }
        catch (Exception)
        {
            return false;
        }

        static int ReadLength(ReadOnlySequence<byte> buffer)
        {
            if (buffer.FirstSpan.Length > MessageLengthSize)
            {
                return BitConverter.ToInt32(buffer.FirstSpan[0..MessageLengthSize]);
            }
            else
            {
                Span<byte> copy = stackalloc byte[MessageLengthSize];
                buffer.Slice(0, MessageLengthSize).CopyTo(copy);
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
                    var message = JsonConvert.DeserializeObject<TunnelHttpRequestMessage>(json);
                    message!.Content = content;
                    return message;
                }
            case TunnelMessageType.HttpResponse:
                {
                    var message = JsonConvert.DeserializeObject<TunnelHttpResponseMessage>(json);
                    message!.Content = content;
                    return message;
                }
            case TunnelMessageType.ServiceStatus:
                {
                    return JsonConvert.DeserializeObject<TunnelServiceStatusMessage>(json);
                }
            case TunnelMessageType.ConnectionReconnect:
                {
                    return JsonConvert.DeserializeObject<TunnelConnectionReconnectMessage>(json);
                }
            case TunnelMessageType.ConnectionClose:
                {
                    return JsonConvert.DeserializeObject<TunnelConnectionCloseMessage>(json);
                }
            case TunnelMessageType.ConnectionConnected:
                {
                    return JsonConvert.DeserializeObject<TunnelConnectionConnectedMessage>(json!);
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
        var content = (message as TunnelByteContentMessage)?.Content;
        MessagePackWriter.Create(stream)
            .Array(3)
            .Int((int)message.Type)
            .Text(JsonConvert.SerializeObject(message))
            .Simple().Value(content)
            .When(content != null).Simple().Value(content)
            .EndArray()
            .Terminate();
    }
}

#nullable restore
