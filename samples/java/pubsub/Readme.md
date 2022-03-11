# Publish and subscribe messages

## Prerequisites

- [Java Development Kit (JDK)](/java/azure/jdk/) version 8 or above
- [Apache Maven](https://maven.apache.org/download.cgi)
- Create an Azure Web PubSub resource
- [localtunnel](https://github.com/localtunnel/localtunnel) to expose our localhost to internet

## Copy the ConnectionString from portal

Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service to be used later.
![connection string](../../../docs/images/portal_conn.png)
    
## Run the subscriber

Open a new terminal window, copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, run the below command with the `<connection-string>` replaced by your **Connection String**:

```console
cd webpubsub-quickstart-subscriber
mvn compile & mvn package & mvn exec:java -Dexec.mainClass="com.webpubsub.quickstart.App" -Dexec.cleanupDaemonThreads=false -Dexec.args="'<connection_string>' 'myHub1'"
```

## Run the publisher

Open a new terminal window, copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, run the below command with the `<connection-string>` replaced by your **Connection String**:

```console
cd webpubsub-quickstart-publisher
mvn compile & mvn package & mvn exec:java -Dexec.mainClass="com.webpubsub.quickstart.App" -Dexec.cleanupDaemonThreads=false -Dexec.args="'<connection_string>' 'myHub1' 'Hello World'"
```

You can see that the client receives message `Hello world`.
