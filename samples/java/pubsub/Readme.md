# Publish and subscribe messages

## Prerequisites

- [Java Development Kit (JDK)](/java/azure/jdk/) version 8 or above
- [Apache Maven](https://maven.apache.org/download.cgi)
- Create an Azure Web PubSub resource
- [ngrok](https://ngrok.com/download) to expose localhost endpoint

## Copy the ConnectionString from portal

1. Copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, and replace the `<connection-string>` (in [PubSub.java](src/main/java/PubSub.java#L7)) below with the value of your **Connection String**.
![connection string](../../../docs/images/portal_conn.png)

## Run the subscriber

1. Open a new terminal window, copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, run the below command with the `<connection-string>` replaced by your **Connection String**:
    ```console
    cd webpubsub-quickstart-subscriber
    mvn compile & mvn package & mvn exec:java -Dexec.mainClass="com.webpubsub.quickstart.App" -Dexec.cleanupDaemonThreads=false -Dexec.args="'<connection_string>' 'myHub1'"
    ```

## Run the publisher
1. Open a new terminal window, copy **Connection String** from **Keys** tab of the created Azure Web PubSub service, run the below command with the `<connection-string>` replaced by your **Connection String**:
    ```console
    cd webpubsub-quickstart-publisher
    mvn compile & mvn package & mvn exec:java -Dexec.mainClass="com.webpubsub.quickstart.App" -Dexec.cleanupDaemonThreads=false -Dexec.args="'<connection_string>' 'myHub1' 'Hello World'"
    ```

![Pub Sub](../../../docs/images/sample-java-pubsub-console.png)
