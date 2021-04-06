const { WebPubSubServiceClient } = require('@azure/webpubsub');
async function printToken() {
    let serviceClient = new WebPubSubServiceClient("{ConnectionString}", 'chat');
    try {
        let token = await serviceClient.getAuthenticationToken({ userId: "user1" });
        console.log(token);
    } catch (err) {
        console.log(err);
    }
}

async function publish() {
    let serviceClient = new WebPubSubServiceClient("{ConnectionString}", 'chat');
    await serviceClient.sendToAll("Hello", { dataType: 'text'});
    await serviceClient.sendToUser("user1", "{'Hello': 'world'}", {dataType: 'json'});
}

// print token
printToken();

publish();