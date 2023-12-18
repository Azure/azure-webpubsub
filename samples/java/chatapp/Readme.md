# Create a Chat app

## Prerequisites

- [Java Development Kit (JDK)](/java/azure/jdk/) version 8 or above
- [Apache Maven](https://maven.apache.org/download.cgi)
- Create an Azure Web PubSub resource
- [awps-tunnel](https://learn.microsoft.com/azure/azure-web-pubsub/howto-web-pubsub-tunnel-tool) to tunnel traffic from Web PubSub to your localhost

## Use `awps-tunnel` to tunnel traffic from Web PubSub service to your localhost

    ```bash
    npm install -g @azure/web-pubsub-tunnel-tool
    export WebPubSubConnectionString="<connection_string>"
    awps-tunnel run --hub Sample_ChatApp --upstream http://localhost:8080
    ```

## Setup event handler settings

1. Navigate to `settings` in portal.
1. Click **Add** to add setting for hub `sample_chat`.
1. Fill in the URL copied from the previous step to `URL template`.
1. Set URL Pattern to `tunnel:///eventhandler` and check `connected` in System Event Pattern, click "Save".
1. Click `Save` button to update the settings, wait until the settings are updated successfully.
    ![Event Handler](../../images/portal_event_handler_sample_chat.png)

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
