using System;
using System.Threading;
using System.Threading.Tasks;
using Azure.Messaging.EventHubs;
using Azure.Messaging.EventHubs.Consumer;
using Azure.Messaging.EventHubs.Processor;
using Azure.Storage.Blobs;

namespace EventHubsReceiver;

internal class Program
{
    private const string ehubNamespaceConnectionString = "Endpoint=sb://zityang-eventhub.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=wGP014tCmTcrDnc2JcoizVZhLyeP92A/NfepIRRrmyA=";
    private const string eventHubName = "hub1";
    private const string blobStorageConnectionString = "UseDevelopmentStorage=true";
    private const string blobContainerName = "checkpoint";
    static BlobContainerClient storageClient;

    // The Event Hubs client types are safe to cache and use as a singleton for the lifetime
    // of the application, which is best practice when events are being published or read regularly.
    static EventProcessorClient processor;
    static async Task Main(string[] args)
    {
        // Read from the default consumer group: $Default
        string consumerGroup = EventHubConsumerClient.DefaultConsumerGroupName;

        // Create a blob container client that the event processor will use
        storageClient = new BlobContainerClient(blobStorageConnectionString, blobContainerName);

        // Create an event processor client to process events in the event hub
        processor = new EventProcessorClient(storageClient, consumerGroup, ehubNamespaceConnectionString, eventHubName);

        // Register handlers for processing events and handling errors
        processor.ProcessEventAsync += ProcessEventHandler;
        processor.ProcessErrorAsync += ProcessErrorHandler;

        // Start the processing
        await processor.StartProcessingAsync();
        Console.WriteLine("Start");

        await Task.Delay(Timeout.Infinite);
    }

    static async Task ProcessEventHandler(ProcessEventArgs eventArgs)
    {
        // Write the body of the event to the console window
        var data = eventArgs.Data;

        // Console.WriteLine("\tReceived event: {0}, content-type: {1}", eventArgs.Data.EventBody.ToString(), eventArgs.Data.ContentType);
        Console.WriteLine("messageID: {0}", eventArgs.Data.MessageId);
        Console.WriteLine("sequence number: {0}", data.SequenceNumber);
        Console.WriteLine($"content-type: {data.ContentType}");
        Console.WriteLine($"content: {data.EventBody}");
        foreach (var tuple in data.Properties)
        {
            Console.WriteLine($"{tuple.Key}: {tuple.Value}");
        }
        Console.WriteLine();
        // Update checkpoint in the blob storage so that the app receives only new events the next time it's run
        await eventArgs.UpdateCheckpointAsync(eventArgs.CancellationToken);
    }

    static Task ProcessErrorHandler(ProcessErrorEventArgs eventArgs)
    {
        // Write details about the error to the console window
        Console.WriteLine($"\tPartition '{eventArgs.PartitionId}': an unhandled exception was encountered. This was not expected to happen.");
        Console.WriteLine(eventArgs.Exception.Message);
        return Task.CompletedTask;
    }
}
