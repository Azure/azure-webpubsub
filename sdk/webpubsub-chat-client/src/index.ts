import { ChatClient, ChatError } from './chatClient.js';
import { ERRORS } from './constant.js';

export type {
  MessageInfo,
  RoomInfo,
  RoomInfoWithMembers,
  UserProfile,
} from './generatedTypes.js';

export type {
  ChatMessage,
  OnMessageArgs,
  OnRoomJoinedArgs,
  OnRoomLeftArgs,
  OnMemberJoinedArgs,
  OnMemberLeftArgs,
} from './events.js';

export type {
  OperationOptions,
  StartOptions,
  StopOptions,
  GetRoomOptions,
  CreateRoomOptions,
  SendToRoomOptions,
  GetUserInfoOptions,
  AddUserToRoomOptions,
  RemoveUserFromRoomOptions,
  ListRoomMessagesOptions,
} from './options.js';

/**
 * Known values of `ChatError.code`. Following the Azure SDK
 * `Known<Name>` convention, this is a runtime constants object whose
 * values are the wire codes returned by the chat service. Compare
 * `error.code` against members of this object rather than against
 * string literals.
 *
 * @example
 * ```ts
 * try {
 *   await client.sendToRoom(roomId, "hi");
 * } catch (err) {
 *   if (err instanceof ChatError && err.code === KnownChatErrorCode.UnknownRoom) {
 *     // ...
 *   }
 * }
 * ```
 *
 * The service may add codes in newer versions, so always handle the
 * unknown-code case as well.
 */
export const KnownChatErrorCode = ERRORS;

export { ChatClient, ChatError };

