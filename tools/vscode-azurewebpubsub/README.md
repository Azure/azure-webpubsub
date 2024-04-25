# Azure Web PubSub for Visual Studio Code (Preview)

[Azure Web PubSub](https://azure.microsoft.com/products/web-pubsub) helps developer build real-time messaging web applications using WebSockets and the publish-subscribe pattern easily. Use the Azure Web PubSub extension for VS Code to quickly create, manage and utilize Azure Web PubSub Service and its developer tools such as [Azure Web PubSub Local Tunnel Tool](https://www.npmjs.com/package/@azure/web-pubsub-tunnel-tool).

> Sign up today for your free Azure account and receive 12 months of free popular services, $200 free credit and 25+ always free services 👉 [Start Free](https://azure.microsoft.com/free/open-source).

## Installation

1. Download and install the [Azure Web PubSub extension](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-azurewebpubsub) for Visual Studio Code
2. Wait for the extension to finish installing then reload Visual Studio Code when prompted
3. Once complete, you'll see an Azure icon in the Activity Bar
   > If your activity bar is hidden, you won't be able to access the extension. Show the Activity Bar by clicking View > Appearance > Show Activity Bar
4. Sign in to your Azure Account by clicking Sign in to Azure…
   > If you don't already have an Azure Account, click "Create a Free Azure Account"

## Create a New Azure Web PubSub Service

1. Once you are signed in, create your Azure Web PubSub Service by clicking the "+" button or by right-clicking your subscription

   ![Create Resource](https://raw.githubusercontent.com/Azure/azure-webpubsub/main/tools/vscode-azurewebpubsub/resources/readme/createResource.png)

2. Select **Create Web PubSub Service**. If you are using Socket.IO server, select **Create Web PubSub Service For Socket.IO** instead. See [the document](https://learn.microsoft.com/azure/azure-web-pubsub/socketio-overview) for detail

   ![Create Azure Web PubSub](https://raw.githubusercontent.com/Azure/azure-webpubsub/main/tools/vscode-azurewebpubsub/resources/readme/createWebPubSub.png)
    
3. Type a unique name for the service. Then select resource group, location, pricing tier and unit count for it

## Features
- View, create, delete, and restart Azure Web PubSub Service
- View, create, delete hub setting
- View, create, delete and update event handler
- View metrics
- Scale up and scale out
- Check resource health
- Regenerate access key
- Copy connection string or endpoint of the service to clipboard
- Attach [Azure Web PubSub local tunnel tool](https://www.npmjs.com/package/@azure/web-pubsub-tunnel-tool)
- View [LiveTrace Tool](https://learn.microsoft.com/azure/azure-web-pubsub/howto-troubleshoot-resource-logs#steps-for-access-key-enabled)

## Create a New Hub Setting
1. Right click the service where you want to create a new hub setting.

   ![Create Hub Setting](https://raw.githubusercontent.com/Azure/azure-webpubsub/main/tools/vscode-azurewebpubsub/resources/readme/createHubSetting.png)

2. Click **Create Hub Setting**
3. Type a name for the hub setting
4. Select the annoymous connection policy
4. (Optional) Create a single or multiple event handlers to the hub setting

## Scale 

1. Right click the service you want to scale up or scale out and then click **Advanced**

   ![Advanced](https://raw.githubusercontent.com/Azure/azure-webpubsub/main/tools/vscode-azurewebpubsub/resources/readme/advanced.png)

2. Click **Scale up** or **Scale Out**

3. Select the new unit count (scale out) or pricing tier (scale up) for your service

   ![Scale Out](https://raw.githubusercontent.com/Azure/azure-webpubsub/main/tools/vscode-azurewebpubsub/resources/readme/scaleOut.png)
   ![Scale Up](https://raw.githubusercontent.com/Azure/azure-webpubsub/main/tools/vscode-azurewebpubsub/resources/readme/scaleUp.png)

## Attach Local Tunnel Tool

1. Expand the hub setting dropdown list, right click the hub setting you want to attach the tunnel tool and then click **Attach Local tunnel**

   ![Attach Local Tunnel](https://raw.githubusercontent.com/Azure/azure-webpubsub/main/tools/vscode-azurewebpubsub/resources/readme/attachLocalTunnel.png)

2. A tunnel-enabled event handler will be created to support Local Tunnel Tool
   ![Add Tunnel Handler](https://raw.githubusercontent.com/Azure/azure-webpubsub/main/tools/vscode-azurewebpubsub/resources/readme/addTunnelEventHandler.png)

   You could customize its system events and user events

   ![View Tunnel Handler](https://raw.githubusercontent.com/Azure/azure-webpubsub/main/tools/vscode-azurewebpubsub/resources/readme/viewTunnelEventHandler.png)

3. A new terminal will be created and the command to run Local Tunnel Tool on your chosen hub setting will be executed automatically
   ![View Tunnel Terminal](https://raw.githubusercontent.com/Azure/azure-webpubsub/main/tools/vscode-azurewebpubsub/resources/readme/viewTunnelTerminal.png)

4. Click **Open Local Tunnel Portal** to see detail in web browser

   ![Local Tunnel Portal](https://raw.githubusercontent.com/Azure/azure-webpubsub/main/tools/vscode-azurewebpubsub/resources/readme/openTunnelPortal.png)

## Contributing

There are a couple of ways you can contribute to this repo:

- **Ideas, feature requests and bugs**: We are open to all ideas and we want to get rid of bugs! Use the [Issues section](https://github.com/Azure/azure-webpubsub/issues) to either report a new issue, provide your ideas or contribute to existing threads.
- **Documentation**: Found a typo or strangely worded sentences? Submit a PR in the [Pull Request Session](https://github.com/Azure/azure-webpubsub/pulls)!
- **Code**: Contribute bug fixes, features or design changes:
  - Clone the repository locally and open in VS Code.
  - Install [TSLint for Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=ms-vscode.vscode-typescript-tslint-plugin).
  - Open the terminal (press `CTRL+`\`) and run `npm install`.
  - To build, press `F1` and type in `Tasks: Run Build Task`.
  - Debug: press `F5` to start debugging the extension.

### Legal

You will need to sign a **Contribution License Agreement** before we can accept your pull request.
All you need to do is to submit a pull request, then the PR will get appropriately labelled (e.g. `cla-required`, `cla-norequired`, `cla-signed`, `cla-already-signed`). If you already signed the agreement we will continue with reviewing the PR, otherwise system will tell you how you can sign the CLA. Once you sign the CLA all future PR's will be labeled as `cla-signed`.

### Code of Conduct

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

### Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft trademarks or logos is subject to and must follow Microsoft’s Trademark & Brand Guidelines. Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship. Any use of third-party trademarks or logos are subject to those third-party’s policies.

## Security

Microsoft takes the security of our software products and services seriously, which includes all source code repositories managed through our GitHub organizations, which include [Microsoft](https://github.com/Microsoft), [Azure](https://github.com/Azure), [DotNet](https://github.com/dotnet), [AspNet](https://github.com/aspnet), [Xamarin](https://github.com/xamarin), and [our GitHub organizations](https://opensource.microsoft.com/).

If you believe you have found a security vulnerability in any Microsoft-owned repository that meets [Microsoft's definition of a security vulnerability](<https://docs.microsoft.com/en-us/previous-versions/tn-archive/cc751383(v=technet.10)>), please report it to us as described below.

### Reporting Security Issues

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them to the Microsoft Security Response Center (MSRC) at [https://msrc.microsoft.com/create-report](https://msrc.microsoft.com/create-report).

If you prefer to submit without logging in, send email to [secure@microsoft.com](mailto:secure@microsoft.com). If possible, encrypt your message with our PGP key; please download it from the [Microsoft Security Response Center PGP Key page](https://www.microsoft.com/en-us/msrc/pgp-key-msrc).

You should receive a response within 24 hours. If for some reason you do not, please follow up via email to ensure we received your original message. Additional information can be found at [microsoft.com/msrc](https://www.microsoft.com/msrc).

Please include the requested information listed below (as much as you can provide) to help us better understand the nature and scope of the possible issue:

- Type of issue (e.g. buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit the issue

This information will help us triage your report more quickly.

If you are reporting for a bug bounty, more complete reports can contribute to a higher bounty award. Please visit our [Microsoft Bug Bounty Program](https://microsoft.com/msrc/bounty) page for more details about our active programs.

### Preferred Languages

We prefer all communications to be in English.

### Policy

Microsoft follows the principle of [Coordinated Vulnerability Disclosure](https://www.microsoft.com/en-us/msrc/cvd).

<!-- endregion exclude-from-marketplace -->

## Telemetry

VS Code collects usage data and sends it to Microsoft to help improve our products and services. Read our [privacy statement](https://go.microsoft.com/fwlink/?LinkID=528096&clcid=0x409) to learn more. If you don’t wish to send usage data to Microsoft, you can set the `telemetry.enableTelemetry` setting to `false`. Learn more in our [FAQ](https://code.visualstudio.com/docs/supporting/faq#_how-to-disable-telemetry-reporting).

## License

[MIT](LICENSE.md)
