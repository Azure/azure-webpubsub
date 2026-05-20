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

export type {
  ChatMessage,
  ChatEventMap,
  ChatEventName,
  ChatEventListener,
  Disposable,
  MessageEvent,
  RoomJoinedEvent,
  RoomLeftEvent,
  MemberJoinedEvent,
  MemberLeftEvent,
} from './events.js';

export { ChatClient, ChatError };
