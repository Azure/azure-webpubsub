import type {
  UserProfile,
  ChatConversation,
  MessageInfo,
  RoomInfo,
  NewMessageNotification,
  NewRoomNotification,
  ContactRequest,
  CreateTextMessage,
  JoinRoomRequest,
  RoomMember,
  ListUserConversationRequest,
  UserPolicy
} from '../src/types.js';

// Test UserProfile
const userProfile: UserProfile = {
  UserId: 'user123',
  Rooms: ['room1', 'room2', 'room3'],
};
console.log('✓ UserProfile:', userProfile);

// Test ChatConversation
const chatConversation: ChatConversation = {
  RoomId: 'room123',
  TopicId: null,
  ConversationId: 'conv456'
};
console.log('✓ ChatConversation:', chatConversation);

// Test MessageInfo
const messageInfo: MessageInfo = {
  MessageId: 'msg001',
  Sender: 'user123',
  SentAt: '2025-12-10T10:30:00Z',
  MessageType: 'Text',
  MessageBodyType: 'Inline',
  Body: 'Hello, World!',
  RefMessageId: null,
//   Metadata: { priority: 'normal' }
};
console.log('✓ MessageInfo:', messageInfo);

// Test RoomInfo
const roomInfo: RoomInfo = {
  RoomId: 'room123',
  Title: 'General Chat',
  DefaultConversation: 'conv456',
  Properties: null
};
console.log('✓ RoomInfo:', roomInfo);

// Test NewMessageNotification
const newMessageNotification: NewMessageNotification = {
  NotificationType: 'NewMessage',
  Body: {
    Conversation: chatConversation,
    Message: messageInfo,
    NotificationType: 'NewMessage'
  }
};
console.log('✓ NewMessageNotification:', newMessageNotification);

// Test NewRoomNotification
const newRoomNotification: NewRoomNotification = {
  NotificationType: 'NewRoom',
  Body: {
    RoomId: 'room123',
    Title: 'New Room',
    NotificationType: 'NewRoom'
  }
};
console.log('✓ NewRoomNotification:', newRoomNotification);

// Test ContactRequest
const contactRequest: ContactRequest = {
  UserId: 'user456',
  Message: 'Hi, let\'s connect!'
};
console.log('✓ ContactRequest:', contactRequest);

// Test CreateTextMessage
const createTextMessage: CreateTextMessage = {
  Conversation: chatConversation,
  Message: 'Hello everyone!',
  RefMessageId: null,
  'Ext.Mentions': ['user456', 'user789'],
  'Ext.DeleteAfterRead': false,
  'Ext.Scheduled': null
};
console.log('✓ CreateTextMessage:', createTextMessage);

// Test JoinRoomRequest
const joinRoomRequest: JoinRoomRequest = {
  UserId: 'user123',
  Message: 'I would like to join this room'
};
console.log('✓ JoinRoomRequest:', joinRoomRequest);

// Test RoomMember
const roomMember: RoomMember = {
  UserId: 'user123',
  Role: 'member'
};
console.log('✓ RoomMember:', roomMember);

// Test ListUserConversationRequest
const listUserConversationRequest: ListUserConversationRequest = {
  ContinuationToken: null,
  MaxCount: 100
};
console.log('✓ ListUserConversationRequest:', listUserConversationRequest);

// Test UserPolicy
const userPolicy: UserPolicy = {
  AddContact: 'ManualApprove',
  PublicProperties: ['Nickname', 'Avatar'],
  FriendProperties: ['Email'],
  PrivateProperties: ['Phone']
};
console.log('✓ UserPolicy:', userPolicy);

console.log('\n✅ All type tests passed!');
