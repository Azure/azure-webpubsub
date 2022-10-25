using System;
using System.Threading.Tasks;
using Azure.Messaging.EventHubs.Consumer;

namespace EventHubsReceiver;

internal class Program
{
    private const string ehubNamespaceConnectionString = "Endpoint=sb://zityang-eventhub.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=fI5dmYbr3NX96yBwEldmgWcaqnUYCoRjb+I8bMK5Iuo=";

    private const string eventHubName = "hub1";

    // The Event Hubs client types are safe to cache and use as a singleton for the lifetime
    // of the application, which is best practice when events are being published or read regularly.
    static async Task Main(string[] args)
    {
        var eventConsumer = new EventHubConsumerClient(EventHubConsumerClient.DefaultConsumerGroupName, ehubNamespaceConnectionString, eventHubName);
        await foreach (var partitionEvent in eventConsumer.ReadEventsAsync(false))
        {
            var data = partitionEvent.Data;

            Console.WriteLine("messageID: {0}", data.MessageId);
            Console.WriteLine("sequence number: {0}", data.SequenceNumber);
            Console.WriteLine($"content-type: {data.ContentType}");
            Console.WriteLine($"content: {data.EventBody}");
            foreach (var tuple in data.Properties)
            {
                Console.WriteLine($"{tuple.Key}: {tuple.Value}");
            }
            Console.WriteLine();
        }
    }
}
