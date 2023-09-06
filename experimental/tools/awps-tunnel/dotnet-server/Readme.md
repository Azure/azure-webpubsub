# Azure Web PubSub tunnel tool

## Overview
This tool opens a tunnel connection to your Azure Web PubSub service. When your hub set event handler upstream URL to `tunnel:///<path>`, the service redirect the traffic to the tunnel connection and the tool then forward the traffic to your local server.

## Auth
Option 1. Use Azure CLI authentication `az login` before running the tool, assign your account with `Web PubSub Service Owner` role.
Option 2. Use ConnectionString login, pass in `--cs <ConnectionString>` when running the tool

## Install
```cli
dotnet tool install -g awps-tunnel --version 0.0.1-alpha-006 --add-source https://www.myget.org/F/azure-webpubsub-dev/api/v3/index.json
```
## Usage

You can bind the default service endpoint URL and the default hub to connect to using `bind` command.

`awps-tunnel bind --url https://your-endpoint --hub your-hub`

You can use `status` command to show the current binded info.
`awps-tunnel status`

`run` to start the tunnel
`awps-tunnel run`

## How to build and run

Open awps-tunnel.sln and F5

