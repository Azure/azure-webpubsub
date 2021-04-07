# Steps

1. Create a webpubsub resource and get the connection string.

    ```text 
    Endpoint=https://test-for-subprotocol.webpubsubdev.azure.com;AccessKey=Y1rAYFSEyx21W8sW3xDooQzttoL2TvECIRRkRkkUsX8=;Version=1.0;
    ```

2. Click "Settings", then click "Add Event Handler Settings For Hub", add a hub named **chat**.

3. Install **ngrok**, [link](https://ngrok.com/), than run the command below:

    ```bash
    ngrok http 5050
    ```

4. Configure the URL Template

    ```text
    http://28a3abf6f291.ngrok.io/api/webpubsub/hubs/{hub}
    ```

5. Select **connect** in the System Event Pattern drop list.

6. Click "Save" button in the top left corner.

7. Run node.js server (node 10 is required)

    ```bash
    nvm use 10
    npm install
    node server.js "<ConnectionString in the step 1>"
    ```

8. Open **localhost:5050**, [link](http://localhost:5050)

9. Try it.