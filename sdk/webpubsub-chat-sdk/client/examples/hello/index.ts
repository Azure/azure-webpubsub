import { WebPubSubClient } from '@azure/web-pubsub-client';
import { ChatClient, MessageInfo, RoomInfo} from 'webpubsub-chat-sdk';

let wpsConnection = new WebPubSubClient("<client-access-url>");

let chatClient = await ChatClient.login(wpsConnection);

// P0(MVP): setup callbacks.
chatClient.onNewMessage((message: MessageInfo) => { console.log(message.Body); });
chatClient.onNewRoom((room:RoomInfo) => {  console.log(room.RoomId); });

// P0(MVP): one to one chat
let bob = await chatClient.getUserInfo("bob");

// todo: hide continuationToken, process internal
// list all conversations of a user
let continuationToken: string = bob.UserId;
while (true) {
    const result = await chatClient.listConversationByUser(continuationToken, 10);
    if (!result.continuationToken) break;
    continuationToken = result.continuationToken;
    console.log(result.conversations);
}

let message1 = await chatClient.sendToUser(bob, "hi bob");
// or equivalently:
let message2 = await chatClient.sendToUser(bob.UserId, "hi bob!");

// P0(MVP): get chat room title.
let rooms: RoomInfo[] = chatClient.rooms;
for(const room of rooms) {
   let roomInfo = await chatClient.getRoom(room.RoomId);
   console.log(roomInfo.Title);
}

// P0(MVP): create a room.
let room = await chatClient.createRoom({
   title: "fruit party",
   // TODO: add self by default
   members: [ "apple", "banana", "cherry" ]
});

// P0(MVP): send a text message in room.
let message3 = await chatClient.sendToRoom(room, "hi everyone!");
// or equivalently:
let message4 = await chatClient.sendToRoom(room.RoomId, "hi everyone!");
// or equivalently:
let message5 = await chatClient.sendToConversation(room.DefaultConversation, "hi everyone!");