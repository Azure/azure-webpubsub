# Create a Chat app

## Prerequisites

- [Java Development Kit (JDK)](/java/azure/jdk/) version 8 or above
- [Apache Maven](https://maven.apache.org/download.cgi)
- Create an Azure Web PubSub resource
- [ngrok](https://ngrok.com/download) to expose localhost endpoint

## Use localtunnel to expose localhost

[localtunnel](https://github.com/localtunnel/localtunnel) is an open-source project that help expose your localhost to public. [Install the tool](https://github.com/localtunnel/localtunnel#installation) and run:

```bash
lt --port 8080 --print-requests
```

localtunnel will print out an url (`https://<domain-name>.loca.lt`) that can be accessed from internet, e.g. `https://xxx.loca.lt`.

> Tip:
> There is one known issue that [localtunnel goes offline when the server restarts](https://github.com/localtunnel/localtunnel/issues/466) and [here is the workaround](https://github.com/localtunnel/localtunnel/issues/466#issuecomment-1030599216)  

There are also other tools to choose when debugging the webhook locally, for example, [ngrok](​https://ngrok.com/), [loophole](https://loophole.cloud/docs/), [TunnelRelay](https://github.com/OfficeDev/microsoft-teams-tunnelrelay) or so. Some tools might have issue returning response headers correctly. Try the following command to see if the tool is working properly:

```bash
curl https://<domain-name>.loca.lt/eventhandler -X OPTIONS -H "WebHook-Request-Origin: *" -H "ce-awpsversion: 1.0" --ssl-no-revoke -i
```

Check if the response header contains `webhook-allowed-origin: *`. This curl command actually checks if the WebHook [abuse protection request](https://docs.microsoft.com/azure/azure-web-pubsub/reference-cloud-events#webhook-validation) can response with the expected header.


## Setup event handler settings

1. Navigate to `settings` in portal.
1. Click **Add** to add setting for hub `chat`.
1. Fill in the URL copied from the previous step to `URL template`.
1. Set URL Pattern to `https://<domain-name>.loca.lt/eventhandler` and check `connected` in System Event Pattern, click "Save".
1. Click `Save` button to update the settings, wait until the settings are updated successfully.
    ![Event Handler](./../../../docs/images/portal_event_handler.png)

## Start server

1. Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, run the below command with the `<connection-string>` replaced by your **Connection String**:

```console
mvn compile & mvn package & mvn exec:java -Dexec.mainClass="com.webpubsub.tutorial.App" -Dexec.cleanupDaemonThreads=false -Dexec.args="'<connection_string>'"
```

![connection string](../../../docs/images/portal_conn.png)

## Send Messages in chat room

1. Open a browser in and visit http://localhost:8080.
2. Input your user name, and click `OK` button to attend the chat.

3. You will get welcome message `[SYSTEM] <user-name> is joined`.
4. Input a message to send, press `Enter` key to publish. 
5. You will see the message in the chat room.
6. Repeat the above steps in a window, you can see messages broadcast to all the windows.
![chat room](../../../docs/images/simple-chat-room.png)
