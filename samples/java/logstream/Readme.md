# Publish and subscribe messages

## Prerequisites

- [Java Development Kit (JDK)](/java/azure/jdk/) version 8 or above
- [Apache Maven](https://maven.apache.org/download.cgi)
- Create an Azure Web PubSub resource

## Copy the ConnectionString from portal

Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service to be used later.
![connection string](../../../docs/images/portal_conn.png)
    

## Run the streaming web server

Open a new terminal window, copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, run the below command with the `<connection-string>` replaced by your **Connection String**:

```console
cd logstream-webserver
mvn compile & mvn package & mvn exec:java -Dexec.mainClass="com.webpubsub.tutorial.App" -Dexec.cleanupDaemonThreads=false -Dexec.args="'<connection_string>'"
```

Now open http://localhost:8080 in browser. If you are using Chrome, you can press F12 or right-click -> **Inspect** -> **Developer Tools**, and select the **Network** tab. Load the web page, and you can see the WebSocket connection is established. Click to inspect the WebSocket connection, you can see below `connected` event message is received in client. You can see that you can get the `connectionId` generated for this client.

```json
{"type":"system","event":"connected","userId":null,"connectionId":"<the_connection_id>"}
```

## Run the streaming console app

Start a new terminal window:

```console
cd logstream-streaming
mvn compile & mvn package & mvn exec:java -Dexec.mainClass="com.webpubsub.quickstart.App" -Dexec.cleanupDaemonThreads=false
```

Type any text and they'll be displayed in the browser in real time.

