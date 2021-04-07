const WebSocket = require('ws');

async function main() {
    let clients = [
        new WebSocket("{client_url_from_portal}")
    ];

    var res = await Promise.all(clients.map(async client => {
        // Wait for the client to connect using async/await
        await new Promise(resolve => client.once('open', resolve));
        console.log("open")

        // Prints "Hello!" twice, once for each client.
        client.send("Hello!");
    }));

    console.log(res);
}

main();