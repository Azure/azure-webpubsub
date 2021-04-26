---
layout: docs
title: WebSocket Clients
group: references
subgroup: server-sdks
toc: true
---

## Using Server SDKs

* [Source Code](https://github.com/Azure/azure-sdk-for-net/tree/master/sdk/webpubsub/Azure.Messaging.WebPubSub)
* [Package](https://www.myget.org/feed/azure-webpubsub-dev/package/nuget/Azure.Messaging.WebPubSub/1.0.0-beta.1)

### Install
```
dotnet add package Azure.Messaging.WebPubSub --version 1.0.0-beta.1 --source https://www.myget.org/F/azure-webpubsub-dev/api/v3/index.json
```

### Sample Usage
```cs
using System;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading.Tasks;
using Azure.Messaging.WebPubSub;
namespace publisher
{
    class Program
    {
        static async Task Main(string[] args)
        {
            var serviceClient = new WebPubSubServiceClient("<connection_string>", "<hub>");
            await serviceClient.SendToAllAsync("hello");
        }
    }
}
```