import { ChatClient, ChatError } from './chatClient.js';

export type {
  MessageInfo,
  MessageRangeQuery,
  RoomInfo,
  RoomInfoWithMembers,
  UserProfile,
  Notification,
  NewMessageNotificationBody,
  NewRoomNotificationBody,
  MemberJoinedNotificationBody,
  MemberLeftNotificationBody,
  RoomLeftNotificationBody,
  SendMessageResponse,
} from './generatedTypes.js';

export { ChatClient, ChatError };
