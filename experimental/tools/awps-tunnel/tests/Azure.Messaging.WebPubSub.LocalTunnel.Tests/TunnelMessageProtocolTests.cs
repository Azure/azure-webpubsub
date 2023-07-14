using System.Net.Http;
using System.Text;

using Xunit;

public class TunnelMessageProtocolTests
{
    [Fact]
    public void TestRequestMessage()
    {
        var message = new TunnelHttpRequestMessage(1, true, "a", HttpMethod.Head.Method, "a", new System.Collections.Generic.Dictionary<string, string[]>
        {
            ["a"] = new string[] { "b" }
        })
        {
            Content = Encoding.UTF8.GetBytes("Hello")
        };
        Assert.Equal(TunnelMessageType.HttpRequest, message.Type);
        var parsed = TestCore(message);
        Assert.Equal(TunnelMessageType.HttpRequest, parsed.Type);
        Assert.Equal(message.Type, parsed.Type);
        Assert.Equal(message.ChannelName, parsed.ChannelName);
        Assert.Equal(message.HttpMethod, parsed.HttpMethod);
        Assert.Equal(message.Url, parsed.Url);
        Assert.Equal(message.Headers, parsed.Headers);
        Assert.Equal(message.LocalRouting, parsed.LocalRouting);
        Assert.Equal(message.Content.ToArray(), parsed.Content.ToArray());
    }

    [Fact]
    public void TestResponseMessage()
    {
        var message = new TunnelHttpResponseMessage(1, true, 200, "a", new System.Collections.Generic.Dictionary<string, string[]>
        {
            ["a"] = new string[] { "b" }
        })
        {
            Content = Encoding.UTF8.GetBytes("Hello")
        };
        Assert.Equal(TunnelMessageType.HttpResponse, message.Type);
        var parsed = TestCore(message);
        Assert.Equal(TunnelMessageType.HttpResponse, parsed.Type);
        Assert.Equal(message.Type, parsed.Type);
        Assert.Equal(message.ChannelName, parsed.ChannelName);
        Assert.Equal(message.Headers, parsed.Headers);
        Assert.Equal(message.LocalRouting, parsed.LocalRouting);
        Assert.Equal(message.Content.ToArray(), parsed.Content.ToArray());
        Assert.Equal(message.StatusCode, parsed.StatusCode);
    }

    [Fact]
    public void TestStatusMessage()
    {
        var message = new TunnelServiceStatusMessage("a");
        Assert.Equal(TunnelMessageType.ServiceStatus, message.Type);
        var parsed = TestCore(message);
        Assert.Equal(TunnelMessageType.ServiceStatus, parsed.Type);
        Assert.Equal(message.Message, parsed.Message);
    }

    [Fact]
    public void TestReconnectMessage()
    {
        var message = new TunnelConnectionReconnectMessage("a", "b", "c");
        Assert.Equal(TunnelMessageType.ConnectionReconnect, message.Type);
        var parsed = TestCore(message);
        Assert.Equal(TunnelMessageType.ConnectionReconnect, parsed.Type);
        Assert.Equal(message.Message, parsed.Message);
    }

    [Fact]
    public void TestRebalanceMessage()
    {
        var message = new TunnelConnectionRebalanceMessage("a", "b", "c");
        Assert.Equal(TunnelMessageType.ConnectionRebalance, message.Type);
        var parsed = TestCore(message);
        Assert.Equal(TunnelMessageType.ConnectionRebalance, parsed.Type);
        Assert.Equal(message.Message, parsed.Message);
    }

    [Fact]
    public void TestCloseMessage()
    {
        var message = new TunnelConnectionCloseMessage("a");
        Assert.Equal(TunnelMessageType.ConnectionClose, message.Type);
        var parsed = TestCore(message);
        Assert.Equal(TunnelMessageType.ConnectionClose, parsed.Type);
        Assert.Equal(message.Message, parsed.Message);
    }

    [Fact]
    public void TestConnectedMessage()
    {
        var message = new TunnelConnectionConnectedMessage("a", "b", "c");
        Assert.Equal(TunnelMessageType.ConnectionConnected, message.Type);
        var parsed = TestCore(message);
        Assert.Equal(TunnelMessageType.ConnectionConnected, parsed.Type);
        Assert.Equal(message.ConnectionId, parsed.ConnectionId);
        Assert.Equal(message.UserId, parsed.UserId);
        Assert.Equal(message.ReconnectionToken, parsed.ReconnectionToken);

        message = new TunnelConnectionConnectedMessage("a", null, "b");
        parsed = TestCore(message);
        Assert.Equal(message.ConnectionId, parsed.ConnectionId);
        Assert.Null(parsed.UserId);
        Assert.Equal(message.ReconnectionToken, parsed.ReconnectionToken);

        message = new TunnelConnectionConnectedMessage("a", "b", null);
        parsed = TestCore(message);
        Assert.Equal(message.ConnectionId, parsed.ConnectionId);
        Assert.Equal(message.UserId, parsed.UserId);
        Assert.Null(parsed.ReconnectionToken);
    }

    private static T TestCore<T>(T message) where T : TunnelMessage
    {
        using var ms = new MemoryBufferWriter();
        TunnelMessageProtocol.Instance.Write(message, ms);
        var input = ms.AsReadOnlySequence();
        Assert.True(TunnelMessageProtocol.Instance.TryParse(ref input, out var msg));
        return Assert.IsType<T>(msg);
    }
}
