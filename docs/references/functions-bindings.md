---
layout: docs
title: Functions Bindings
group: references
toc: true
---

# Azure Web PubSub bindings for Azure Functions

## Overview

This reference explains how to handle Web PubSub events in Azure Functions.

Web PubSub is an Azure-managed service that helps developers easily build web applications with real-time features and publish-subscribe pattern.

| Action | Type |
|---------|---------|
| Run a function when messages comes from service | [Trigger](#trigger-binding) |
| Return the service endpoint URL and access token | [Input binding](#input-binding)
| Send Web PubSub messages |[Output binding](#output-binding) |

### Add to your Functions app

#### Functions 2.x and higher

Working with the trigger and bindings requires that you reference the appropriate package. The NuGet package is used for .NET class libraries while the extension bundle is used for all other application types.

| Language                                        | Add by...                                   | Remarks 
|-------------------------------------------------|---------------------------------------------|-------------|
| C#                                              | Installing the [NuGet package], version 2.x | |
| C# Script, Java, JavaScript, Python, PowerShell | Registering the [extension bundle]          | The [Azure Tools extension] is recommended to use with Visual Studio Code. |
| C# Script (online-only in Azure portal)         | Adding a binding                            | To update existing binding extensions without having to republish your function app, see [Update your extensions]. |

[NuGet package]: https://www.nuget.org/packages/Microsoft.Azure.WebJobs.Extensions.WebPubSub
[extension bundle]: https://docs.microsoft.com/azure/azure-functions/functions-bindings-register#extension-bundles 
[Azure Tools extension]: https://marketplace.visualstudio.com/items?itemName=ms-vscode.vscode-node-azure-pack
[Update your extensions]: https://docs.microsoft.com/azure/azure-functions/functions-bindings-register

## Trigger binding


## Input binding

## Output binding
