import React, { useContext } from "react";
import type { ReactNode } from "react";
import { WebPubSubClient } from "@azure/web-pubsub-client";
import { ChatClientContext } from "../contexts/ChatClientContext";
import type { ChatMessage, ConnectionStatus } from "../contexts/ChatClientContext";
import { messagesReducer, initialMessagesState } from "../reducers/messagesReducer";
import type { MessagesAction } from "../reducers/messagesReducer";
import { ChatSettingsContext } from "../contexts/ChatSettingsContext";
import { BACKEND_URL, DEFAULT_ROOM_ID } from "../lib/constants";

interface ChatClientProviderProps {
  children: ReactNode;
}
const backendUrl = BACKEND_URL;

export const ChatClientProvider: React.FC<ChatClientProviderProps> = ({ children }) => {
  const settingsContext = useContext(ChatSettingsContext);

  const [client, setClient] = React.useState<WebPubSubClient | null>(null);
  const clientRef = React.useRef<WebPubSubClient | null>(null); // Add ref for stable reference
  const [connectionStatus, setConnectionStatus] = React.useState<ConnectionStatus>({
    status: "disconnected",
    message: "Not connected",
  });
  const [messages, dispatch] = React.useReducer(messagesReducer, initialMessagesState);
  const [isStreamingState, setIsStreamingState] = React.useState<boolean>(false);
  const [uiNotice, setUiNotice] = React.useState<{ type: "info" | "error"; text: string } | undefined>(undefined);
  // Cache messages per room to enable smooth, instant room switches
  const messagesByRoomRef = React.useRef<Map<string, ChatMessage[]>>(new Map());
  // Track which rooms have fetched history at least once (per connection), and last fetch per room
  const loadedRoomsRef = React.useRef<Set<string>>(new Set());
  const lastFetchSeqByRoomRef = React.useRef<Map<string, number>>(new Map());
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

  // Merge and de-duplicate messages by id, prefer more complete entries
  const mergeAndSortMessages = React.useCallback((existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] => {
    const byId = new Map<string, ChatMessage>();
    const pick = (oldMsg: ChatMessage | undefined, newMsg: ChatMessage): ChatMessage => {
      if (!oldMsg) return newMsg;
      const oldLen = (oldMsg.content ?? "").length;
      const newLen = (newMsg.content ?? "").length;
      // Prefer message with longer content (more complete), keep streaming if either is streaming
      const base = newLen >= oldLen ? newMsg : oldMsg;
      const other = newLen >= oldLen ? oldMsg : newMsg;
      return {
        ...base,
        streaming: !!(base.streaming || other.streaming),
        // preserve sender and timestamp if missing on base
        sender: base.sender ?? other.sender,
        timestamp: base.timestamp ?? other.timestamp ?? new Date().toISOString(),
      };
    };
    for (const m of existing) {
      byId.set(m.id, m);
    }
    for (const m of incoming) {
      const merged = pick(byId.get(m.id), m);
      byId.set(m.id, merged);
    }
    const arr = Array.from(byId.values());
    arr.sort((a, b) => {
      const ta = new Date(a.timestamp || 0).getTime();
      const tb = new Date(b.timestamp || 0).getTime();
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });
    return arr;
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
      updateRoomMessages(roomIdRef.current, { type: "userMessage", payload: { id: userMessageId, content: messageText, userId: userIdRef.current ?? "" } });

      // Show a local 'Thinking...' placeholder before AI starts streaming
      updateRoomMessages(roomIdRef.current, { type: "addPlaceholder" });
      // Reset streaming state
      setIsStreamingState(false);

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
            const url = `${backendUrl}/negotiate?roomId=${roomIdRef.current}`;
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error(`Negotiation failed: ${response.statusText}`);
            }
            return await response.text();
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
          // reset per-connection loaded set so first switch to any room will fetch once
          loadedRoomsRef.current = new Set();
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
          // Handle special rooms meta channel via type (no need to parse group name)
          if (messageData?.type === "rooms-changed") {
            const serverRooms = (messageData.rooms ?? []).map((r) => r?.name).filter((n): n is string => typeof n === "string" && n.length > 0);
            const merged = Array.from(new Set([DEFAULT_ROOM_ID, ...serverRooms]));
            setRoomsRef.current?.(merged);
            return;
          }
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

        // After connect, join special sys_rooms group to receive rooms-changed notifications
        newClient.on("connected", async () => {
          try {
            await newClient.joinGroup("sys_rooms");
          } catch (e) {
            console.warn("Failed to join sys_rooms group", e);
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
  }, [updateRoomMessages]);

  // Join newly added rooms and leave removed rooms on the active connection
  React.useEffect(() => {
    if (!client) return;
    const nextRooms: Set<string> = new Set<string>(rooms ?? []);
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
    const requestedRoom = roomId; // capture room for this effect run
    const cached = messagesByRoomRef.current.get(requestedRoom);
    const alreadyLoaded = loadedRoomsRef.current.has(requestedRoom);
    const lastSeq = lastFetchSeqByRoomRef.current.get(requestedRoom) ?? -1;
    const needFetch = !alreadyLoaded || lastSeq < reconnectSeq;
    let cancelled = false;

    const run = async () => {
      // Immediately show cached messages (if any) for the requested room to avoid blank flashes
      if (cached && cached.length > 0 && roomIdRef.current === requestedRoom) {
        dispatch({ type: "setAll", payload: cached });
        setIsStreamingState(false);
      }
      if (needFetch) {
        try {
          const res = await fetch(`${backendUrl}/api/rooms/${encodeURIComponent(requestedRoom)}/messages?limit=50`);
          if (res.ok) {
            type ServerMsg = { messageId?: string; message?: string; from?: string; timestamp?: string };
            type MsgResp = { messages?: ServerMsg[] };
            const data = (await res.json()) as MsgResp;
            const mapped: ChatMessage[] = (data.messages ?? []).map((m) => ({
              id: String(m.messageId ?? Date.now() + Math.random()),
              content: String(m.message ?? ""),
              sender: m.from,
              timestamp: m.timestamp ?? new Date().toISOString(),
              isFromCurrentUser: m.from === userIdRef.current,
            }));
            const existing = messagesByRoomRef.current.get(requestedRoom) ?? [];
            const merged = mergeAndSortMessages(existing, mapped);
            if (cancelled) return;
            messagesByRoomRef.current.set(requestedRoom, merged);
            // Only update UI if this room is still active
            if (roomIdRef.current === requestedRoom) {
              dispatch({ type: "setAll", payload: merged });
            }
            loadedRoomsRef.current.add(requestedRoom);
            lastFetchSeqByRoomRef.current.set(requestedRoom, reconnectSeq);
            setIsStreamingState(false);
            return;
          }
        } catch {
          // ignore fetch errors
        }
      }
      // No fetch needed or fetch failed: prefer cached if present; otherwise, avoid forcing an empty list
      if (cancelled) return;
      if (roomIdRef.current === requestedRoom) {
        if (cached && cached.length > 0) {
          dispatch({ type: "setAll", payload: cached });
        }
      }
      setIsStreamingState(false);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [roomId, client, mergeAndSortMessages, reconnectSeq]);

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
      uiNotice,
    }),
    [client, connectionStatus, messages, isStreaming, sendMessage, clearMessages, uiNotice],
  );
  return <ChatClientContext.Provider value={value}>{children}</ChatClientContext.Provider>;
};
