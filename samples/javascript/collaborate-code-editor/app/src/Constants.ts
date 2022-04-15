export enum MessageType {
  System = 'system',
  JoinGroup = 'joinGroup',
  SendToGroup = 'sendToGroup',
}

export enum MessageDataType {
  Init = 'init',
  Sync = 'sync',
}

export interface MessageData {
  t: string; // type / target uuid
  f: string; // origin uuid
  c: string; // base64 encoded binary data
}

export interface Message {
  type: string;
  from: string;
  group: string;
  data: MessageData;
}
