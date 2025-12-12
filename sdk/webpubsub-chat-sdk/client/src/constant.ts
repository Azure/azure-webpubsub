const INVOCATION_NAME = {
    LOGIN: {
        LOGIN: "chat:Login"
    },
    USER: {
        LIST_USER_CONVERSATION: "chat:ListUserConversation", // P0
        GET_USER_PROPERTIES: "chat:GetUserProperties",
    },
    CONTACTS: {

    },
    ROOMS: {
        GET_ROOM: "chat:GetRoom",
    },
    MESSAGES: {
        LIST_MESSAGES: "chat:ListMessages",
        SEND_TEXT_MESSAGE: "chat:SendTextMessage",
    },
    ROOMS_MANAGEMENT: {
        CREATE_ROOM: "chatmgmt:CreateRoom",
    },
}

export { INVOCATION_NAME };