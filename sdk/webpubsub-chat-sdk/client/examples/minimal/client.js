import { WebPubSubClient } from '@azure/web-pubsub-client';
import { ChatClient } from '@azure/web-pubsub-chat-client';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

async function getClientAccessUrl(userId) {
    const response = await fetch(`${SERVER_URL}/negotiate?userId=${userId}`);
    const data = await response.json();
    return data.url;
}

async function main() {
    // Create two clients to demonstrate chat functionality
    const url1 = await getClientAccessUrl('alice');
    const url2 = await getClientAccessUrl('bob');

    const wpsClient1 = new WebPubSubClient(url1);
    const wpsClient2 = new WebPubSubClient(url2);

    // Login both clients
    const alice = await ChatClient.login(wpsClient1);
    const bob = await ChatClient.login(wpsClient2);

    console.log(`Alice logged in as: ${alice.userId}`);
    console.log(`Bob logged in as: ${bob.userId}`);

    // Setup event listeners for Bob
    bob.addListenerForNewRoom((room) => {
        console.log(`[Bob] Joined new room: "${room.Title}" (${room.RoomId})`);
    });

    bob.addListenerForNewMessage((notification) => {
        const msg = notification.Message;
        console.log(`[Bob] New message from ${msg.CreatedBy}: ${msg.Body}`);
    });

    // Alice creates a room and invites Bob
    console.log('\n--- Alice creates a room ---');
    const room = await alice.createRoom('Hello World Room', [bob.userId]);
    console.log(`[Alice] Created room: "${room.Title}" with members: ${room.Members?.join(', ')}`);

    // Alice sends messages to the room
    console.log('\n--- Alice sends messages ---');
    for (let i = 1; i <= 3; i++) {
        const msgId = await alice.sendToRoom(room.RoomId, `Hello from Alice #${i}`);
        console.log(`[Alice] Sent message #${i}, id: ${msgId}`);
    }

    // List message history
    console.log('\n--- Message History ---');
    const history = await alice.listRoomMessage(room.RoomId, null, null);
    for (const msg of history.Messages) {
        console.log(`  [${msg.CreatedBy}] [${msg.CreatedAt}] ${msg.Body}`);
    }

    // Cleanup
    console.log('\n--- Cleanup ---');
    alice.stop();
    bob.stop();
    console.log('Done!');
}

main().catch(console.error);
