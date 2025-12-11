const INVOCATION_NAME = {
    login: {
        LOGIN: "chat:Login"
    },
    user: {
        LIST_USER_CONVERSATION: "chat:ListUserConversation", // P0
        GET_USER_PROPERTIES: "chat:GetUserProperties",
    },
    contacts: {

    },
    rooms: {
        GET_ROOM: "chat:GetRoom",
    },
    messages: {
        LIST_MESSAGES: "chat:ListMessages",
        SEND_TEXT_MESSAGE: "chat:SendTextMessage",
    },
    roomsManagement: {
        CREATE_ROOM: "chatmgmt:CreateRoom",
    },
}

export { INVOCATION_NAME };