const INVOCATION_NAME = {
    LOGIN: "chat.login",
    LIST_USER_CONVERSATION: "chat.listUserConversation",
    GET_USER_PROPERTIES: "chat.getUserProperties",
    GET_ROOM: "chat.getRoom",
    LIST_MESSAGES: "chat.queryMessageHistory",
    SEND_TEXT_MESSAGE: "chat.sendTextMessage",
    CREATE_ROOM: "chat.createRoom",
    JOIN_ROOM: "chat.joinRoom",
    MANAGE_ROOM_MEMBER: "chat.manageRoomMember",
} as const;

const ERRORS = {
    ROOM_ALREADY_EXISTS: "RoomAlreadyExists",
    USER_ALREADY_IN_ROOM: "UserAlreadyInRoom",
    NO_PERMISSION_IN_ROOM: "NoPermissionInRoom",
} as const;

export { INVOCATION_NAME, ERRORS };
