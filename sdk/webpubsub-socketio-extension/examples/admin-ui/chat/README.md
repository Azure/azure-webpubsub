
# Azure Socket.IO Admin UI Sample

This sample is modified from the sample "chat" to show how to use Socket.IO Admin UI.

## How to use 
1. Open Azure Socket.IO Admin UI website in your browser.
2. Click the "Update" button in the right top corner and fill in the service endpoint of your resource.
3. Install the dependencies and start the server
    ```bash
    $ npm install
    $ npm run start -- "<connection-string>"
    ```
4. Open a new tab to `http://localhost:3000` in your browser. Try the chat room.
5. Go back to the Admin UI and check related information.

## Note
- The two lines below are necessary to make the Admin UI work
    ```javascript
    const { Namespace } = require("socket.io");
    Namespace.prototype["fetchSockets"] = async function() { return this.local.fetchSockets(); };
    ```