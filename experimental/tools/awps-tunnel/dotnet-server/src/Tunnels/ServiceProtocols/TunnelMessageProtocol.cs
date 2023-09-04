using System;
using System.Buffers;
using System.Diagnostics.CodeAnalysis;
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

    public bool TryParseResponseMessage(ReadOnlyMemory<byte> data, [NotNullWhen(true)] out TunnelHttpResponseMessage? message)
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

        if (length > MaxLength)
        {
            return false;
        }

        if (buffer.Length < length + MessageLengthSize)
        {
            return false;
        }

        var content = buffer.Slice(MessageLengthSize, length);
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
        using var lpWriter = writer.WithLengthPrefix();
        WriteMessageCore(lpWriter, message);
        return lpWriter.OuterLength;
    }

    private static TunnelMessage? Parse(ReadOnlySequence<byte> input, bool throwOnError)
    {
        var reader = MessagePackReader.Create(input)
            .Array()
            .Int(out var type)
            .Text(out var json)
            .Simple().Value(out ReadOnlyMemory<byte>? content);
        switch ((TunnelMessageType)type)
        {
            case TunnelMessageType.HttpRequest:
                {
                    var message = JsonConvert.DeserializeObject<TunnelHttpRequestMessage>(json!);
                    message!.Content = content ?? Array.Empty<byte>();
                    return message;
                }
            case TunnelMessageType.HttpResponse:
                {
                    var message = JsonConvert.DeserializeObject<TunnelHttpResponseMessage>(json!);
                    message!.Content = content ?? Array.Empty<byte>();
                    return message;
                }
            case TunnelMessageType.ServiceStatus:
                {
                    return JsonConvert.DeserializeObject<TunnelServiceStatusMessage>(json!);
                }
            case TunnelMessageType.ConnectionReconnect:
                {
                    return JsonConvert.DeserializeObject<TunnelConnectionReconnectMessage>(json!);
                }
            case TunnelMessageType.ConnectionRebalance:
                {
                    return JsonConvert.DeserializeObject<TunnelConnectionRebalanceMessage>(json!);
                }
            case TunnelMessageType.ConnectionClose:
                {
                    return JsonConvert.DeserializeObject<TunnelConnectionCloseMessage>(json!);
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

    private static void WriteMessageCore(IBufferWriter<byte> writer, TunnelMessage message)
    {
        var content = (message as TunnelByteContentMessage)?.Content;
        MessagePackWriter.Create(writer)
            .Array(3)
            .Int((int)message.Type)
            .Text(JsonConvert.SerializeObject(message))
            .Simple().Value(content)
            .EndArray()
            .Terminate();
    }
}
