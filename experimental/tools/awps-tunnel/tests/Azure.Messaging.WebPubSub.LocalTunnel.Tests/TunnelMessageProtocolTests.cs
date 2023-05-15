using System.Net.Http;
using System.Text;

using Xunit;

public class TunnelMessageProtocolTests
{
    [Fact]
    public void TestRequestMessage()
    {
        var message = new TunnelRequestMessage(1, true, "a", HttpMethod.Head.Method, "b", new Dictionary<string, string[]>
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
        Assert.Equal(message.GlobalRouting, parsed.GlobalRouting);
        Assert.Equal(message.Content.ToArray(), parsed.Content.ToArray());
    }

    [Fact]
    public void TestResponseMessage()
    {
        var message = new TunnelResponseMessage(1, true, 200, "a", new Dictionary<string, string[]>
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
        Assert.Equal(message.GlobalRouting, parsed.GlobalRouting);
        Assert.Equal(message.Content.ToArray(), parsed.Content.ToArray());
        Assert.Equal(message.StatusCode, parsed.StatusCode);
    }

    [Fact]
    public void TestStatusMessage()
    {
        var message = new ServiceStatusTunnelMessage("a");
        Assert.Equal(TunnelMessageType.ServiceStatus, message.Type);
        var parsed = TestCore(message);
        Assert.Equal(TunnelMessageType.ServiceStatus, parsed.Type);
        Assert.Equal(message.Message, parsed.Message);
    }

    [Fact]
    public void TestReconnectMessage()
    {
        var message = new ServiceReconnectTunnelMessage("a", "b", "c");
        Assert.Equal(TunnelMessageType.ConnectionReconnectCommand, message.Type);
        var parsed = TestCore(message);
        Assert.Equal(TunnelMessageType.ConnectionReconnectCommand, parsed.Type);
        Assert.Equal(message.Message, parsed.Message);
    }

    [Fact]
    public void TestCloseMessage()
    {
        var message = new ConnectionCloseTunnelMessage("a");
        Assert.Equal(TunnelMessageType.ConnectionCloseCommand, message.Type);
        var parsed = TestCore(message);
        Assert.Equal(TunnelMessageType.ConnectionCloseCommand, parsed.Type);
        Assert.Equal(message.Message, parsed.Message);
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
