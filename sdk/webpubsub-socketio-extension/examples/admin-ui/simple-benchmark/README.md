
# Azure Socket.IO Admin UI Simple Benchmark

This sample is a server for a simple echo performance benchmark.

## How to use 
1. Open Azure Socket.IO Admin UI website in your browser.
2. Click the "Update" button in the right top corner and fill in the service endpoint of your resource.
3. Install the dependencies and start the server
    ```bash
    $ npm install
    $ export PORT=3000 # Set environmental variable for server port number. Default value is 3000
    $ npm run start -- "<connection-string>"
    ```
4. Open Admin UI page and click the "Benchmark" tab in the left sidebar.
5. Fill in parameters and then start the benchmark.

## Note
- The two lines below are necessary to make the Admin UI work
    ```javascript
    const { Namespace } = require("socket.io");
    Namespace.prototype["fetchSockets"] = async function() { return this.local.fetchSockets(); };
    ```

- The simple echo benchmark is designed for dev/test use. DO NOT refer to it for production use.

    The benchmark result is largely different from a serious benchmark result, for all clients are hosted in a web browser of a single machine.