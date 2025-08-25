import React, { useContext } from "react";
import type { ReactNode } from "react";
import { WebPubSubClient } from "@azure/web-pubsub-client";
import { ChatClientContext } from "../contexts/ChatClientContext";
import type { ChatMessage, ConnectionStatus } from "../contexts/ChatClientContext";
import { messagesReducer, initialMessagesState } from "../reducers/messagesReducer";
import type { MessagesAction } from "../reducers/messagesReducer";
import { AvatarContext } from "../contexts/AvatarContext";
import { ChatSettingsContext } from "../contexts/ChatSettingsContext";

interface ChatClientProviderProps {
  children: ReactNode;
}
const backendUrl = "http://localhost:5000";
export const ChatClientProvider: React.FC<ChatClientProviderProps> = ({ children }) => {
  const avatarContext = useContext(AvatarContext);
  const settingsContext = useContext(ChatSettingsContext);

  const [client, setClient] = React.useState<WebPubSubClient | null>(null);
  const clientRef = React.useRef<WebPubSubClient | null>(null); // Add ref for stable reference
  const [connectionStatus, setConnectionStatus] = React.useState<ConnectionStatus>({
    status: "disconnected",
    message: "Not connected",
  });
  const [messages, dispatch] = React.useReducer(messagesReducer, initialMessagesState);
  const [isStreamingState, setIsStreamingState] = React.useState<boolean>(false);
  // Cache messages per room to enable smooth, instant room switches
  const messagesByRoomRef = React.useRef<Map<string, ChatMessage[]>>(new Map());
  // Refs to guard against double-initialize within the same tick and across effect re-runs
  const initStartedRef = React.useRef(false);
  const connectingRef = React.useRef(false);
  const joinedGroupsRef = React.useRef<Set<string>>(new Set());
  const prevRoomsRef = React.useRef<Set<string>>(new Set());

  if (!avatarContext || !settingsContext) {
    throw new Error("ChatClientProvider must be used within AvatarProvider and ChatSettingsProvider");
  }

   const { userId, setUserId } = avatarContext;
   const { roomId, rooms } = settingsContext;

  const makeWelcomeMessage = React.useCallback((): ChatMessage => ({
    id: "welcome",
    content: "Hello! I'm your AI assistant. How can I help you today?",
    sender: "AI Assistant",
    timestamp: new Date().toISOString(),
    isUser: false,
  }), []);

  // Refs for latest values (to avoid reconnections)
  const userIdRef = React.useRef(userId);
  const roomIdRef = React.useRef(roomId);
  // Setter ref to avoid adding setDisplayName to effect deps
  const setUserIdRef = React.useRef(setUserId);

  // Update refs when values change
  React.useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);
  React.useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);
  React.useEffect(() => {
    setUserIdRef.current = setUserId;
  }, [setUserId]);

  // Persist messages to cache keyed by current room
  React.useEffect(() => {
    if (roomIdRef.current) {
      messagesByRoomRef.current.set(roomIdRef.current, messages);
    }
  }, [messages]);

  // Helper: apply a messages action to a specific room (by id/group),
  // updating the offscreen cache and, if it's the active room, the UI reducer.
  const updateRoomMessages = React.useCallback((targetRoomId: string | undefined, action: MessagesAction) => {
    const roomKey = targetRoomId || roomIdRef.current || "public";
    const prev = messagesByRoomRef.current.get(roomKey) ?? [];
    const next = messagesReducer(prev, action);
    messagesByRoomRef.current.set(roomKey, next);
    // Reflect in UI only if updating the active room
    if (roomKey === roomIdRef.current) {
      dispatch(action);
    }
  }, []);

  // Send message function
  const sendMessage = React.useCallback(
    async (messageText: string) => {
      if (!client || !messageText.trim()) return;

      // Add user message
      const userMessageId = Date.now().toString();
  updateRoomMessages(roomIdRef.current, { type: "userMessage", payload: { id: userMessageId, content: messageText, userId: userIdRef.current || "" } });

      // Show a local 'Thinking...' placeholder before AI starts streaming
  updateRoomMessages(roomIdRef.current, { type: "addPlaceholder" });
      // Reset streaming state
      setIsStreamingState(false);

      try {
        await client.sendEvent(
          "sendToAI",
          {
            from: userIdRef.current,
            message: messageText,
            timestamp: new Date().toISOString(),
            type: "user-message",
            roomId: roomIdRef.current,
          },
          "json",
        );
      } catch (err: unknown) {
    const errorMessageId = Date.now().toString();
    updateRoomMessages(roomIdRef.current, { type: "completeMessage", payload: { messageId: errorMessageId, content: `Error sending message: ${err instanceof Error ? err.message : "Unknown error"}`, sender: "System", isFromCurrentUser: false } });
      }
    },
  [client, updateRoomMessages],
  ); // Only depend on client

  const clearMessages = React.useCallback(() => {
    dispatch({ type: "clear" });
    setIsStreamingState(false);
  }, []);

  // ---------------------- message helpers ----------------------

  // Initialize client ONCE on mount - no reconnections needed
  React.useEffect(() => {
    const initializeClient = async () => {
      // Synchronous + ref guards to avoid re-entry even under StrictMode
      if (connectingRef.current || initStartedRef.current) return;
      connectingRef.current = true;
      // Keep state writes minimal to avoid retriggers

      try {
        setConnectionStatus({ status: "connecting", message: "Connecting..." });

        // Stop existing client if any
        if (clientRef.current) {
          try {
            await clientRef.current.stop();
          } catch (err) {
            console.error("Error stopping previous client:", err);
          }
        }

        // Create new client with initial roomId and initial displayName if website url contains userId query
        const newClient = new WebPubSubClient({
          getClientAccessUrl: async () => {
            let url = `${backendUrl}/negotiate?roomId=${roomIdRef.current}`;
            if (userIdRef.current) {
              url += `&userId=${encodeURIComponent(userIdRef.current)}`;
            }
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error(`Negotiation failed: ${response.statusText}`);
            }
            return await response.text();
          },
        });

        // Set up event listeners using refs for latest values
        newClient.on("connected", (e) => {
          setConnectionStatus({
            status: "connected",
            message: "Connected",
            connectionId: e.connectionId,
          });
          // Use ref to avoid effect dependency on setDisplayName
          setUserIdRef.current(e.userId || userIdRef.current);
          // reset joined set; server auto-joins the negotiated room
          joinedGroupsRef.current = new Set();
          if (roomIdRef.current) joinedGroupsRef.current.add(roomIdRef.current);
        });

        newClient.on("disconnected", () => {
          setConnectionStatus({
            status: "disconnected",
            message: `Disconnected: Connection closed`,
          });
        });

        type GroupMessageEventLike = { group?: string; message: { data: unknown } };
        newClient.on("group-message", (e) => {
          // Type assertion for WebPubSub message data structure
          const messageData = (e as GroupMessageEventLike).message.data as {
            messageId?: string;
            streaming?: boolean;
            streamingEnd?: boolean;
            message?: string;
            from?: string;
            roomId?: string;
          };
          // Determine the group/room this message belongs to (prefer event.group, fallback to data.roomId)
          const targetRoom = (e as GroupMessageEventLike).group || messageData?.roomId;
          if (!targetRoom) {
            // If we can't determine the target room, drop the message to avoid misrouting
            return;
          }
          const messageId = messageData?.messageId;
          const streaming = !!messageData?.streaming;
          const streamingEnd = !!messageData?.streamingEnd;
          const messageContent = messageData?.message;
          const sender = messageData?.from || "AI Assistant";
          const isFromCurrentUser = sender === userIdRef.current; // Use ref

          // Handle streaming end signal
          if (streaming && streamingEnd) {
            if (targetRoom === roomIdRef.current) setIsStreamingState(false);
            if (messageId) updateRoomMessages(targetRoom, { type: "streamEnd", payload: { messageId } });
            return;
          }

          // Handle streaming messages
          if (streaming) {
            if (targetRoom === roomIdRef.current) setIsStreamingState(true);
            if (messageId && messageContent) updateRoomMessages(targetRoom, { type: "streamChunk", payload: { messageId, chunk: messageContent, sender } });
          } else {
            if (targetRoom === roomIdRef.current) setIsStreamingState(false);
            if (messageId) updateRoomMessages(targetRoom, { type: "completeMessage", payload: { messageId, content: messageContent, sender, isFromCurrentUser } });
          }
        });

        await newClient.start();
        clientRef.current = newClient;
        setClient(newClient);
        // Mark initialized via ref only
        initStartedRef.current = true;
      } catch (err: unknown) {
        setConnectionStatus({
          status: "error",
          message: `Connection Failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        });
        // remain not initialized so we can retry later
      } finally {
        connectingRef.current = false;
      }
    };

    // Kick off initialization; guards above ensure single start (even under StrictMode)
    initializeClient();

    // Cleanup function to prevent multiple connections
    return () => {
      if (clientRef.current) {
        try {
          clientRef.current.stop();
        } catch (error) {
          console.error("Error stopping client:", error);
        }
        clientRef.current = null;
      }
    };
  }, [updateRoomMessages]);

  // Join newly added rooms and leave removed rooms on the active connection
  React.useEffect(() => {
    if (!client) return;
    const nextRooms = new Set((rooms || []).filter(Boolean));
    const joined = joinedGroupsRef.current;
    // compute toJoin: in nextRooms but not joined
    const toJoin: string[] = [];
    nextRooms.forEach((g) => { if (!joined.has(g)) toJoin.push(g); });
    // compute toLeave: joined but not in nextRooms
    const toLeave: string[] = [];
    joined.forEach((g) => { if (!nextRooms.has(g)) toLeave.push(g); });

    if (toJoin.length === 0 && toLeave.length === 0) {
      prevRoomsRef.current = nextRooms;
      return;
    }

    (async () => {
      // Join new groups
      for (const g of toJoin) {
        try {
          await client.joinGroup(g);
          joined.add(g);
        } catch (err) {
          console.error("joinGroup failed:", g, err);
        }
      }
      // Leave removed groups
      for (const g of toLeave) {
        try {
          await client.leaveGroup(g);
          joined.delete(g);
        } catch (err) {
          console.error("leaveGroup failed:", g, err);
        }
      }
      prevRoomsRef.current = nextRooms;
    })();
  }, [rooms, client]);

  // Handle room changes - swap to cached messages or show welcome instantly
  React.useEffect(() => {
    if (client && roomId) {
      const cached = messagesByRoomRef.current.get(roomId);
      if (cached && cached.length > 0) {
        dispatch({ type: "setAll", payload: cached });
      } else {
    // Fresh room: show welcome immediately in a single render for smoother UX
    dispatch({ type: "setAll", payload: [makeWelcomeMessage()] });
      }
      setIsStreamingState(false);
    }
  }, [roomId, client, makeWelcomeMessage]);

  // Welcome on first connection if room has no cached messages yet
  React.useEffect(() => {
    if (connectionStatus.status === "connected" && messages.length === 0) {
    dispatch({ type: "setAll", payload: [makeWelcomeMessage()] });
    }
  }, [connectionStatus.status, messages.length, makeWelcomeMessage]);

  // Derive isStreaming from messages if available; fallback to state for transient UI control
  const isStreaming = React.useMemo(() => {
    if (messages.length === 0) return isStreamingState;
    return messages.some((m) => m.streaming);
  }, [messages, isStreamingState]);

  const value = React.useMemo(
    () => ({
      client,
      connectionStatus,
      messages,
      isStreaming,
      sendMessage,
      clearMessages,
    }),
    [client, connectionStatus, messages, isStreaming, sendMessage, clearMessages],
  );
  return <ChatClientContext.Provider value={value}>{children}</ChatClientContext.Provider>;
};
