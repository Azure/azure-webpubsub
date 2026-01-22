import type { ChatMessage } from "../contexts/ChatClientContext";

// State is just the list of messages for now
export type MessagesState = ChatMessage[];

export type MessagesAction =
  | { type: "clear" }
  | { type: "welcome" }
  | { type: "setAll"; payload: ChatMessage[] }
  | { type: "userMessage"; payload: { id: string; content: string; userId: string } }
  | { type: "updateMessageAck"; payload: { messageId: string; isAcked: boolean } }
  | { type: "addPlaceholder" }
  | { type: "streamChunk"; payload: { messageId: string; chunk: string; sender: string } }
  | { type: "streamEnd"; payload: { messageId: string } }
  | { type: "completeMessage"; payload: { messageId: string; content?: string; sender: string; isFromCurrentUser: boolean } };

const nowIso = () => new Date().toISOString();

const findLastPlaceholderIndex = (arr: ChatMessage[]) => {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i].isPlaceholder) return i;
  }
  return -1;
};

export const initialMessagesState: MessagesState = [];

export function messagesReducer(state: MessagesState, action: MessagesAction): MessagesState {
  switch (action.type) {
    case "clear":
      return [];
    case "setAll":
      return [...action.payload];
    case "welcome": {
      if (state.length > 0) return state;
      const welcome: ChatMessage = {
        id: "welcome",
        content: "Hello! I'm your AI assistant. How can I help you today?",
        sender: "AI Assistant",
        timestamp: nowIso(),
        isFromCurrentUser: false,
      };
      return [welcome];
    }
    case "userMessage": {
      const { id, content, userId } = action.payload;
      const userMsg: ChatMessage = {
        id,
        content,
        sender: userId,
        timestamp: nowIso(),
        isFromCurrentUser: true,
        isAcked: false, // Initially not acknowledged
      };
      return [...state, userMsg];
    }
    case "updateMessageAck": {
      const { messageId, isAcked } = action.payload;
      return state.map(msg => 
        msg.id === messageId ? { ...msg, isAcked } : msg
      );
    }
    case "addPlaceholder": {
      const thinking: ChatMessage = {
        id: `pending-${Date.now()}`,
        content: "Thinking...",
        sender: "AI Assistant",
        timestamp: nowIso(),
        isFromCurrentUser: false,
        streaming: true,
        isPlaceholder: true,
      };
      return [...state, thinking];
    }
    case "streamChunk": {
      const { messageId, chunk, sender } = action.payload;
      const existingIndex = state.findIndex((m) => m.id === messageId);
      if (existingIndex >= 0) {
        const existing = state[existingIndex];
        const next = [...state];
        if (existing.isPlaceholder) {
          next[existingIndex] = { ...existing, content: chunk || "", isPlaceholder: false };
        } else {
          next[existingIndex] = { ...existing, content: (existing.content || "") + (chunk || "") };
        }
        // ensure streaming flag while chunks are arriving
        next[existingIndex].streaming = true;
        return next;
      }
      const lastPh = findLastPlaceholderIndex(state);
      if (lastPh !== -1) {
        const next = [...state];
        next[lastPh] = {
          ...next[lastPh],
          id: messageId,
          content: chunk || "",
          isPlaceholder: false,
          sender,
          streaming: true,
        } as ChatMessage;
        return next;
      }
      return [
        ...state,
        {
          id: messageId || Date.now().toString(),
          content: chunk || "",
          sender,
          timestamp: nowIso(),
          isFromCurrentUser: false,
          streaming: true,
        } as ChatMessage,
      ];
    }
    case "streamEnd": {
      const { messageId } = action.payload;
      return state.map((m) => (m.id === messageId ? { ...m, streaming: false } : m));
    }
    case "completeMessage": {
      const { messageId, content, sender, isFromCurrentUser } = action.payload;
      const existingIndex = state.findIndex((m) => m.id === messageId);
      if (existingIndex >= 0) {
        const next = [...state];
        next[existingIndex] = {
          ...next[existingIndex],
          content: content || "",
          streaming: false,
          isPlaceholder: false,
        };
        return next;
      }
      const lastPh = findLastPlaceholderIndex(state);
      if (lastPh !== -1) {
        const next = [...state];
        next[lastPh] = {
          ...next[lastPh],
          id: messageId,
          content: content || "",
          isPlaceholder: false,
          streaming: false,
          sender,
        } as ChatMessage; // keep existing isUser on placeholder (AI)
        return next;
      }
      return [
        ...state,
        {
          id: messageId || Date.now().toString(),
          content: content || "",
          sender,
          timestamp: nowIso(),
          isFromCurrentUser,
        } as ChatMessage,
      ];
    }
    default:
      return state;
  }
}
