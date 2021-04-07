const { WebPubSubServiceClient } = require('@azure/web-pubsub');
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
    // supports object input
    await serviceClient.sendToAll({'Hello': 'world'});
    await serviceClient.sendToUser("user1", {'Hello': 'world'});
}

// print token
printToken();

publish();