const INVOCATION_NAME = {
    LOGIN: "chat.login",
    GET_ROOM: "chat.getRoom",
    LIST_MESSAGES: "chat.queryMessageHistory",
    SEND_TEXT_MESSAGE: "chat.sendTextMessage",
    CREATE_ROOM: "chat.createRoom",
    MANAGE_ROOM_MEMBER: "chat.manageRoomMember",
} as const;

const ERRORS = {
    RoomAlreadyExists: "RoomAlreadyExists",
    UserAlreadyInRoom: "UserAlreadyInRoom",
    NoPermissionInRoom: "NoPermissionInRoom",
    NotStarted: "NotStarted",
    UnknownRoom: "UnknownRoom",
    InvalidServerResponse: "InvalidServerResponse",
} as const;

export { INVOCATION_NAME, ERRORS };
