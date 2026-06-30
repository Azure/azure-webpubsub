import { ChatClient } from '@azure/web-pubsub-chat-client';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

const getClientAccessUrl = (userId) => 
    fetch(`${SERVER_URL}/negotiate?userId=${userId}`).then(r => r.json()).then(d => d.url);

function setupListeners(client) {
    // chat event listeners
    client.on("room-joined", (event) => {
        const room = event.room;
        console.log(`[${client.userId}] joined room "${room.title}" (${room.roomId})`);
    });
    client.on("message", (event) => {
        const msg = event.message;
        console.log(`[${client.userId}] received message from ${msg.createdBy}: ${msg.content.text}`);
    });
    client.on("member-joined", (event) => {
        console.log(`[${client.userId}] saw ${event.userId} joined room ${event.roomId}`);
    });
    client.on("member-left", (event) => {
        console.log(`[${client.userId}] saw ${event.userId} left room ${event.roomId}`);
    });
    client.on("room-left", (event) => {
        console.log(`[${client.userId}] left room ${event.roomId}`);
    });
    // chat lifecycle listener
    client.on("stopped", () => {
        console.log(`chat client stopped`);
    });
}

async function main() {
    // Create chat clients for Alice, Bob, and Mike
    
    // Option 1: create a chat client with a credential (a callback returning a client access URL)
    const alice = await ChatClient.start({ getClientAccessUrl: () => getClientAccessUrl('alice') });
    console.log(`Alice started as: ${alice.userId}`);

    // Option 2: create a chat client directly with a client access URL
    const url2 = await getClientAccessUrl('bob'), url3 = await getClientAccessUrl('mike');
    const bob = await ChatClient.start(url2);
    const mike = await ChatClient.start(url3);
    
    console.log(`Bob started as: ${bob.userId}`);
    console.log(`Mike started as: ${mike.userId}`);

    // Setup event listeners

    setupListeners(alice);
    setupListeners(bob);    
    setupListeners(mike);

    // Alice creates a room and invites Bob
    console.log('\n--- Alice creates a room ---');
    const room = await alice.createRoom('Hello World Room', [bob.userId]);

    // Alice sends messages to the room
    console.log('\n--- Alice sends messages ---');
    for (let i = 1; i <= 3; i++) {
        console.log(`[Alice] will send message #${i}`);
        const msgId = await alice.sendToRoom(room.roomId, `Hello from Alice #${i}`);
    }

    // Bob replies to the room
    console.log('\n--- Bob replies ---');
    for (let i = 1; i <= 2; i++) {
        console.log(`[Bob] will send message #${i}`);
        const msgId = await bob.sendToRoom(room.roomId, `Hi Alice, this is Bob #${i}`);
    }

    // List message history (auto-paginating async iterator)
    console.log('\n--- Message History ---');
    for await (const msg of alice.listRoomMessages(room.roomId)) {
        console.log(`  [${msg.createdBy}] [${msg.createdAt}] ${msg.content.text}`);
    }

    // Or load history one page at a time (Teams-style scroll-back).
    // `byPage` lets the caller decide when to load the next batch — handy
    // for "load 50 latest, then 50 more on scroll-up" UI patterns.
    console.log('\n--- Message History (pages of 3) ---');
    const pages = alice.listRoomMessages(room.roomId).byPage({ maxPageSize: 3 });
    let pageNum = 0;
    while (true) {
        const { value, done } = await pages.next();
        if (done) break;
        console.log(`  Page ${++pageNum} (${value.length} messages):`);
        for (const msg of value) {
            console.log(`    [${msg.createdBy}] ${msg.content.text}`);
        }
    }

    // Alice manages room members
    console.log('\n--- Alice manages room members ---');


    // Alice adds mike to the room
    await alice.addUserToRoom(room.roomId, mike.userId);

    // Alice removes bob and mike from the room
    await alice.removeUserFromRoom(room.roomId, bob.userId);
    await alice.removeUserFromRoom(room.roomId, mike.userId);

    // Cleanup
    console.log('\n--- Cleanup ---');
    await Promise.all([alice, bob, mike].map((client) => client.stop()));
}

main().catch(console.error);
