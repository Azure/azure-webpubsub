using System.Net.WebSockets;
using System.Text;

var uri = "Get the client connection URL from Portal -> Web PubSub resources -> Settings -> Keys -> Client URL generator. Make sure the 'Hub' name is changed to 'hub1'";

var client = new ClientWebSocket();

client.Options.AddSubProtocol("json.webpubsub.azure.v1");

await client.ConnectAsync(new Uri(uri), default);
Console.WriteLine($"Connected");
var json = """
                        {
                            "type": "event",
                            "event": "myEvent",
                            "dataType" : "text",
                            "data": "hello world"
                        }
                        """;
await client.SendAsync(Encoding.UTF8.GetBytes(json), WebSocketMessageType.Text, true, default);
await client.CloseAsync(WebSocketCloseStatus.NormalClosure, null, default);
await Task.Delay(5000);
