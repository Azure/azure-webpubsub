import React, { useContext } from "react";
import type { ReactNode } from "react";
import { WebPubSubClient } from "@azure/web-pubsub-client";
import { ChatClientContext } from "../contexts/ChatClientContext";
import type { ChatMessage, ConnectionStatus } from "../contexts/ChatClientContext";
import { messagesReducer, initialMessagesState } from "../reducers/messagesReducer";
import type { MessagesAction } from "../reducers/messagesReducer";
import { ChatSettingsContext } from "../contexts/ChatSettingsContext";
import { DEFAULT_ROOM_ID } from "../lib/constants";

interface ChatClientProviderProps {
  children: ReactNode;
}
// Using relative paths: negotiate endpoint is /negotiate, API under /api

export const ChatClientProvider: React.FC<ChatClientProviderProps> = ({ children }) => {
  const settingsContext = useContext(ChatSettingsContext);

  const [client, setClient] = React.useState<WebPubSubClient | null>(null);
  const clientRef = React.useRef<WebPubSubClient | null>(null); // Add ref for stable reference
  const [connectionStatus, setConnectionStatus] = React.useState<ConnectionStatus>({
    status: "disconnected",
    message: "Not connected",
  });
  const [messages, dispatch] = React.useReducer(messagesReducer, initialMessagesState);
  // Unified per-room state map (messages, streaming flag, fetch seq + loaded)
  interface RoomState {
    messages: ChatMessage[];
    isStreaming: boolean;
    lastFetchSeq: number; // reconnect sequence when last fetched
    loaded: boolean; // whether initial history fetched in this connection
  }
  const roomStatesRef = React.useRef<Map<string, RoomState>>(new Map());
  const [uiNotice, setUiNotice] = React.useState<{ type: "info" | "error"; text: string } | undefined>(undefined);
  // reconnectSeq increments on each (re)connection so we can trigger refetch logic per roomState
  const [reconnectSeq, setReconnectSeq] = React.useState(0);
  // Refs to guard against double-initialize within the same tick and across effect re-runs
  const initStartedRef = React.useRef(false);
  const connectingRef = React.useRef(false);
  const prevRoomsRef = React.useRef<Set<string>>(new Set());
  // Stable client id across tabs (per origin)

  if (!settingsContext) {
    throw new Error("ChatClientProvider must be used within ChatSettingsProvider");
  }

  const { roomId, rooms, userId, setUserId } = settingsContext;
  // Keep setter refs stable to avoid capturing stale closures in event handlers
  const setUserIdRef = React.useRef(setUserId);
  React.useEffect(() => {
    setUserIdRef.current = setUserId;
  }, [setUserId]);
  const setRoomsRef = React.useRef(settingsContext.setRooms);
  React.useEffect(() => {
    setRoomsRef.current = settingsContext.setRooms;
  }, [settingsContext.setRooms]);

  // Simplified: server history is authoritative; just sort by timestamp then id
  const sortMessages = React.useCallback((msgs: ChatMessage[]): ChatMessage[] => {
    return [...msgs].sort((a, b) => {
      const ta = new Date(a.timestamp || 0).getTime();
      const tb = new Date(b.timestamp || 0).getTime();
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });
  }, []);

  // Refs for latest values (to avoid reconnections)
  const roomIdRef = React.useRef(roomId);
  const userIdRef = React.useRef(userId);
  // No user tracking

  // Update refs when values change
  React.useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);
  // no-op for user
  React.useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // On room change, immediately swap the visible message list to the new room's cache (if any)
  // or clear it so messages from the previous room never visually "bleed" into the next room.
  React.useEffect(() => {
    if (!roomId) return;
    const rs = roomStatesRef.current.get(roomId);
    if (rs && rs.messages.length > 0) {
      dispatch({ type: "setAll", payload: rs.messages });
    } else {
      dispatch({ type: "clear" });
    }
    if (rs) rs.isStreaming = false; // reset streaming flag when switching
  }, [roomId]);

  // Helper: ensure a room state object exists
  const ensureRoomState = React.useCallback((id: string): RoomState => {
    let rs = roomStatesRef.current.get(id);
    if (!rs) {
      rs = { messages: [], isStreaming: false, lastFetchSeq: -1, loaded: false };
      roomStatesRef.current.set(id, rs);
    }
    return rs;
  }, []);

  // Helper: apply a messages action to a specific room (by id/group),
  // updating the offscreen cache and, if it's the active room, the UI reducer.
  const updateRoomMessages = React.useCallback((targetRoomId: string | undefined, action: MessagesAction) => {
    const roomKey = targetRoomId || roomIdRef.current || DEFAULT_ROOM_ID;
    const rs = ensureRoomState(roomKey);
    const prev = rs.messages;
    const next = messagesReducer(prev, action);
    rs.messages = next;
    // Maintain streaming flag heuristics local to the room
    switch (action.type) {
      case "streamChunk":
        rs.isStreaming = true;
        break;
      case "addPlaceholder":
        rs.isStreaming = true; // lock UI while waiting for first chunk
        break;
      case "streamEnd":
      case "completeMessage":
      case "clear":
        rs.isStreaming = false;
        break;
      default:
        break;
    }
    if (roomKey === roomIdRef.current) {
      dispatch(action);
    }
  }, [ensureRoomState]);

  // Send message function
  const sendMessage = React.useCallback(
    async (messageText: string) => {
      if (!client || !messageText.trim()) return;

      // Add user message
      const userMessageId = Date.now().toString();
      updateRoomMessages(roomIdRef.current, { type: "userMessage", payload: { id: userMessageId, content: messageText, userId: userIdRef.current ?? "" } });

      // Show a local 'Thinking...' placeholder before AI starts streaming
      updateRoomMessages(roomIdRef.current, { type: "addPlaceholder" });

      try {
        await client.sendEvent(
          "sendToAI",
          {
            message: messageText,
            timestamp: new Date().toISOString(),
            type: "user-message",
            roomId: roomIdRef.current,
          },
          "json",
        );
      } catch (err: unknown) {
        const msg = `Error sending message: ${err instanceof Error ? err.message : "Unknown error"}`;
        setUiNotice({ type: "error", text: msg });
      }
    },
    [client, updateRoomMessages],
  ); // Only depend on client

  const clearMessages = React.useCallback(() => {
    const activeRoom = roomIdRef.current || DEFAULT_ROOM_ID;
    const rs = ensureRoomState(activeRoom);
    rs.messages = [];
    rs.isStreaming = false;
    dispatch({ type: "clear" });
  }, [ensureRoomState]);

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
        setUiNotice(undefined);

        // Stop existing client if any
        if (clientRef.current) {
          try {
            await clientRef.current.stop();
          } catch (err) {
            console.error("Error stopping previous client:", err);
          }
        }

        // Create new client with initial roomId; no user id
        const newClient = new WebPubSubClient({
          getClientAccessUrl: async () => {
            const url = `/negotiate?roomId=${encodeURIComponent(roomIdRef.current || DEFAULT_ROOM_ID)}`;
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error(`Negotiation failed: ${response.statusText}`);
            }
            const connectUrl = await response.text();
            return connectUrl;
          },
        });

        // Set up event listeners using refs for latest values
        newClient.on("connected", (e: { connectionId: string; userId?: string }) => {
          setConnectionStatus({
            status: "connected",
            message: "Connected",
            connectionId: e.connectionId,
          });
          // If the event includes a userId, store it in settings
          const evtUserId = e?.userId;
          if (typeof evtUserId === "string" && evtUserId.length > 0) {
            setUserIdRef.current?.(evtUserId);
          }
          // Server auto-joins the negotiated room; no client-side tracking needed
          // mark reconnection token to allow one-time refetch for current room
          setReconnectSeq((s) => s + 1);
          // reset loaded flags per room on new connection
          for (const rs of roomStatesRef.current.values()) {
            rs.loaded = false;
          }
        });

        // No additional listeners needed; userId is set via connected event above if provided

        newClient.on("disconnected", () => {
          setConnectionStatus({
            status: "disconnected",
            message: `Disconnected: Connection closed`,
          });
          setUiNotice({ type: "error", text: "Disconnected: Connection closed" });
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
            type?: string;
            rooms?: Array<{ name?: string; messages?: number }>;
          };
          // Determine the target room strictly from payload
          const targetRoom = messageData?.roomId;
          if (!targetRoom) return;
          const messageId = messageData?.messageId;
          const streaming = !!messageData?.streaming;
          const streamingEnd = !!messageData?.streamingEnd;
          const messageContent = messageData?.message;
          const sender = messageData?.from || "AI Assistant";
          const isFromCurrentUser = sender === userIdRef.current;

          // Handle streaming end signal
          if (streaming && streamingEnd) {
            if (messageId) updateRoomMessages(targetRoom, { type: "streamEnd", payload: { messageId } });
            return;
          }
          if (streaming) {
            if (messageId && messageContent) updateRoomMessages(targetRoom, { type: "streamChunk", payload: { messageId, chunk: messageContent, sender } });
          } else {
            if (messageId) updateRoomMessages(targetRoom, { type: "completeMessage", payload: { messageId, content: messageContent, sender, isFromCurrentUser } });
          }
        });

        // Assign clientRef before starting to prevent parallel starts from racing
        clientRef.current = newClient;
        await newClient.start();
        setClient(newClient);
        // Mark initialized via ref only
        initStartedRef.current = true;
      } catch (err: unknown) {
        const msg = `Connection Failed: ${err instanceof Error ? err.message : "Unknown error"}`;
        setConnectionStatus({ status: "error", message: msg });
        setUiNotice({ type: "error", text: msg });
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
  }, [updateRoomMessages, ensureRoomState]);

  // Join newly added rooms and leave removed rooms on the active connection
  React.useEffect(() => {
    if (!client) return;
    const nextRooms: Set<string> = new Set<string>((rooms ?? []).map(room => room.roomId));
    const prevRooms = prevRoomsRef.current;
    // compute toJoin: in nextRooms but not in prevRooms
    const toJoin: string[] = Array.from(nextRooms).filter((g) => !prevRooms.has(g));
    // compute toLeave: in prevRooms but not in nextRooms
    const toLeave: string[] = Array.from(prevRooms).filter((g) => !nextRooms.has(g));

    if (toJoin.length === 0 && toLeave.length === 0) {
      prevRoomsRef.current = nextRooms;
      return;
    }

    (async () => {
      // Join new groups (map to transport group room_<id>)
      for (const g of toJoin) {
        try {
          const roomGroup = `room_${g}`;
          await client.joinGroup(roomGroup);
        } catch (err) {
          console.error("joinGroup failed:", g, err);
        }
      }
      // Leave removed groups
      for (const g of toLeave) {
        try {
          const roomGroup = `room_${g}`;
          await client.leaveGroup(roomGroup);
        } catch (err) {
          console.error("leaveGroup failed:", g, err);
        }
      }
      prevRoomsRef.current = nextRooms;
    })();
  }, [rooms, client]);

  // Handle room changes - fetch history only the first time per room or after reconnect
  React.useEffect(() => {
    if (!client || !roomId) return;
    const requestedRoom = roomId;
    const rs = ensureRoomState(requestedRoom);
    const needFetch = !rs.loaded || rs.lastFetchSeq < reconnectSeq;
    let cancelled = false;

    const run = async () => {
      if (rs.messages.length > 0 && roomIdRef.current === requestedRoom) {
        dispatch({ type: "setAll", payload: rs.messages });
        rs.isStreaming = false;
      }
      if (needFetch) {
        try {
          const res = await fetch(`/api/rooms/${encodeURIComponent(requestedRoom)}/messages?limit=50`);
          if (res.ok) {
            type ServerMsg = { messageId?: string; message?: string; from?: string; timestamp?: string };
            type MsgResp = { messages?: ServerMsg[] };
            const data = (await res.json()) as MsgResp;
            const mapped: ChatMessage[] = (data.messages ?? []).map((m) => {
              const rawFrom = (m.from && String(m.from).trim().length > 0) ? m.from : undefined;
              const sender = rawFrom ?? "AI Assistant";
              return {
                id: String(m.messageId ?? Date.now() + Math.random()),
                content: String(m.message ?? ""),
                sender,
                timestamp: m.timestamp ?? new Date().toISOString(),
                isFromCurrentUser: rawFrom !== undefined && rawFrom === userIdRef.current,
              } as ChatMessage;
            });
            const merged = sortMessages(mapped);
            if (cancelled) return;
            rs.messages = merged;
            rs.loaded = true;
            rs.lastFetchSeq = reconnectSeq;
            rs.isStreaming = false;
            if (roomIdRef.current === requestedRoom) {
              dispatch({ type: "setAll", payload: merged });
            }
            return;
          }
        } catch {
          // ignore fetch errors
        }
      }
      if (cancelled) return;
      if (roomIdRef.current === requestedRoom && rs.messages.length > 0) {
        dispatch({ type: "setAll", payload: rs.messages });
      }
      rs.isStreaming = false;
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [roomId, client, reconnectSeq, ensureRoomState, sortMessages]);

  // Inline status banner rules: show info when connected and empty; clear when messages arrive
  React.useEffect(() => {
    if (connectionStatus.status === "connected" && messages.length === 0) {
      const next = { type: "info" as const, text: "You're connected. Say hi to start the conversation." };
      // Only set if it's not already the same notice to prevent render loops
      if (!(uiNotice && uiNotice.type === "info" && uiNotice.text === next.text)) {
        setUiNotice(next);
      }
    } else if (messages.length > 0) {
      // Clear info notice once we have conversation
      if (uiNotice?.type === "info") setUiNotice(undefined);
    }
  }, [connectionStatus.status, messages.length, uiNotice]);

  // Derive isStreaming from messages if available; fallback to state for transient UI control
  const isStreaming = React.useMemo(() => {
    const activeRoom = roomIdRef.current || roomId || DEFAULT_ROOM_ID;
    const rs = roomStatesRef.current.get(activeRoom);
    if (!rs) return false;
    if (rs.isStreaming) return true;
    return rs.messages.some((m) => m.streaming);
  }, [roomId, messages]);

  const value = React.useMemo(
    () => ({
      client,
      connectionStatus,
      messages,
      isStreaming,
      sendMessage,
      clearMessages,
      uiNotice,
    }),
    [client, connectionStatus, messages, isStreaming, sendMessage, clearMessages, uiNotice],
  );
  return <ChatClientContext.Provider value={value}>{children}</ChatClientContext.Provider>;
};
