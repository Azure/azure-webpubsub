#nullable enable

using System;
using System.Collections.Generic;
using System.Runtime.Serialization;
using System.Text.Json.Serialization;

public abstract class TunnelMessage
{
    public abstract TunnelMessageType Type { get; }
    public ulong? TracingId { get; set; }
}

public enum TunnelMessageType
{
    None = 0,

    // request
    HttpRequest = 1,

    // corresponding response
    HttpResponse = 2,

    ServiceStatus = 5,

    ConnectionReconnectCommand = 6,

    ConnectionCloseCommand = 7,
}

public abstract class ByteContentTunnelMessage : TunnelMessage
{
    [IgnoreDataMember]
    public ReadOnlyMemory<byte> Content { get; set; }
}

public class TunnelRequestMessage : ByteContentTunnelMessage
{
    public override TunnelMessageType Type => TunnelMessageType.HttpRequest;

    public int AckId { get; }

    public string HttpMethod { get; }

    public string Url { get; }

    public IDictionary<string, string[]> Headers { get; }

    public bool GlobalRouting { get; }

    public string ChannelName { get; }

    public TunnelRequestMessage(int ackId, bool globalRouting, string channelName, string httpMethod, string url, IDictionary<string, string[]>? headers)
    {
        AckId = ackId;
        ChannelName = channelName;
        GlobalRouting = globalRouting;
        HttpMethod = httpMethod;
        Url = url;
        Headers = headers ?? new Dictionary<string, string[]>();
    }
}

public class TunnelResponseMessage : ByteContentTunnelMessage
{
    public override TunnelMessageType Type => TunnelMessageType.HttpResponse;

    public int AckId { get; }

    public int StatusCode { get; }

    public IDictionary<string, string[]> Headers { get; }

    public bool GlobalRouting { get; }

    public string ChannelName { get; }

    public TunnelResponseMessage(int ackId, bool globalRouting, int statusCode, string channelName, IDictionary<string, string[]>? headers)
    {
        AckId = ackId;
        GlobalRouting = globalRouting;
        ChannelName = channelName;
        StatusCode = statusCode;
        Headers = headers ?? new Dictionary<string, string[]>();
    }
}

public class ServiceReconnectTunnelMessage : TunnelMessage
{
    public override TunnelMessageType Type => TunnelMessageType.ConnectionReconnectCommand;

    public string TargetId { get; }

    public string Endpoint { get; }

    public string Message { get; }

    public ServiceReconnectTunnelMessage(string targetId, string endpoint, string message)
    {
        TargetId = targetId;
        Endpoint = endpoint;
        Message = message;
    }
}

public class ConnectionCloseTunnelMessage : TunnelMessage
{
    public override TunnelMessageType Type => TunnelMessageType.ConnectionCloseCommand;

    public string Message { get; }

    public ConnectionCloseTunnelMessage(string message)
    {
        Message = message;
    }
}

public class ServiceStatusTunnelMessage : TunnelMessage
{
    public override TunnelMessageType Type => TunnelMessageType.ServiceStatus;

    public string Message { get; }

    public ServiceStatusTunnelMessage(string message)
    {
        Message = message;
    }
}

#nullable restore
