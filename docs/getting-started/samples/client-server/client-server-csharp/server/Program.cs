using System;
using System.Linq;
using Azure.Messaging.WebPubSub;

namespace server
{
    class Program
    {
        static void Main(string[] args)
        {
            if (args.Length != 3) {
                Console.WriteLine("Usage: publisher <endpoint> <key> <hub>");
                return;
            }
            var endpoint = args[0];
            var key = args[1];
            var hub = args[2];
            
            // Either generate the token or fetch it from server or fetch a temp one from the portal
            var serviceClient = new WebPubSubServiceClient(new Uri(endpoint), hub, new Azure.AzureKeyCredential(key));
            serviceClient.SendToAll(new string(Enumerable.Repeat('c', 2038).ToArray()));
        }
    }
}
