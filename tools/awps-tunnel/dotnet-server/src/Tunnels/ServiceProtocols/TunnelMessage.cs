#nullable enable

using System;
using System.Collections.Generic;
using System.Runtime.Serialization;

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

    ConnectionReconnect = 6,

    ConnectionClose = 7,

    ConnectionRebalance = 8,

    ConnectionConnected = 10,
}

public abstract class TunnelByteContentMessage : TunnelMessage
{
    [IgnoreDataMember]
    public ReadOnlyMemory<byte> Content { get; set; }
}

public class TunnelHttpRequestMessage : TunnelByteContentMessage
{
    public override TunnelMessageType Type => TunnelMessageType.HttpRequest;

    public int AckId { get; }

    public string HttpMethod { get; }

    public string Url { get; }

    public IDictionary<string, string[]> Headers { get; }

    public bool LocalRouting { get; }

    public string ChannelName { get; }

    public TunnelHttpRequestMessage(int ackId, bool localRouting, string channelName, string httpMethod, string url, IDictionary<string, string[]>? headers)
    {
        AckId = ackId;
        ChannelName = channelName;
        LocalRouting = localRouting;
        HttpMethod = httpMethod;
        Url = url;
        Headers = headers ?? new Dictionary<string, string[]>();
    }
}

public class TunnelHttpResponseMessage : TunnelByteContentMessage
{
    public override TunnelMessageType Type => TunnelMessageType.HttpResponse;

    public int AckId { get; }

    public int StatusCode { get; }

    public IDictionary<string, string[]> Headers { get; }

    public bool LocalRouting { get; }

    public string ChannelName { get; }

    public TunnelHttpResponseMessage(int ackId, bool localRouting, int statusCode, string channelName, IDictionary<string, string[]>? headers)
    {
        AckId = ackId;
        LocalRouting = localRouting;
        ChannelName = channelName;
        StatusCode = statusCode;
        Headers = headers ?? new Dictionary<string, string[]>();
    }
}

public class TunnelConnectionReconnectMessage : TunnelMessage
{
    public override TunnelMessageType Type => TunnelMessageType.ConnectionReconnect;

    public string TargetId { get; }

    public string Endpoint { get; }

    public string Message { get; }

    public TunnelConnectionReconnectMessage(string targetId, string endpoint, string message)
    {
        TargetId = targetId;
        Endpoint = endpoint;
        Message = message;
    }
}

public class TunnelConnectionCloseMessage : TunnelMessage
{
    public override TunnelMessageType Type => TunnelMessageType.ConnectionClose;

    public string Message { get; }

    public TunnelConnectionCloseMessage(string message)
    {
        Message = message;
    }
}

public class TunnelServiceStatusMessage : TunnelMessage
{
    public override TunnelMessageType Type => TunnelMessageType.ServiceStatus;

    public string Message { get; }

    public TunnelServiceStatusMessage(string message)
    {
        Message = message;
    }
}

public class TunnelConnectionRebalanceMessage : TunnelMessage
{
    public override TunnelMessageType Type => TunnelMessageType.ConnectionRebalance;

    public string TargetId { get; }

    public string Endpoint { get; }

    public string Message { get; }

    public TunnelConnectionRebalanceMessage(string targetId, string endpoint, string message)
    {
        TargetId = targetId;
        Endpoint = endpoint;
        Message = message;
    }
}

public class TunnelConnectionConnectedMessage : TunnelMessage
{
    public override TunnelMessageType Type => TunnelMessageType.ConnectionConnected;

    public string ConnectionId { get; }
    public string? UserId { get; }
    public string? ReconnectionToken { get; }

    public TunnelConnectionConnectedMessage(string connectionId, string? userId, string? reconnectionToken)
    {
        ConnectionId = connectionId;
        UserId = userId;
        ReconnectionToken = reconnectionToken;
    }
}

