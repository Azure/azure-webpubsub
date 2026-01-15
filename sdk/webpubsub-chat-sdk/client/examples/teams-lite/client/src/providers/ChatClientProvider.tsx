import React, { useContext } from "react";
import type { ReactNode } from "react";
import { ChatClient } from "@azure/web-pubsub-chat-client"
import { ChatClientContext } from "../contexts/ChatClientContext";
import type { ChatMessage, ConnectionStatus, OnlineStatus, TypingStatus } from "../contexts/ChatClientContext";
import { messagesReducer, initialMessagesState } from "../reducers/messagesReducer";
import type { MessagesAction } from "../reducers/messagesReducer";
import { ChatSettingsContext, type RoomMetadata } from "../contexts/ChatSettingsContext";
import { DEFAULT_ROOM_ID, DEFAULT_ROOM_NAME, GLOBAL_METADATA_ROOM_NAME, GLOBAL_METADATA_ROOM_ID } from "../lib/constants";
import { LoginDialog } from "../components/LoginDialog";

// Online status configuration
const PING_INTERVAL_MS = 5000; // Send ping every 5 seconds
const OFFLINE_TIMEOUT_MS = 10000; // Mark as offline if no ping received within 10 seconds

// Typing status configuration
const TYPING_TIMEOUT_MS = 5000; // Mark as not typing if no typing indicator received within 5 seconds

interface ChatClientProviderProps {
  children: ReactNode;
}
// Using relative paths: negotiate endpoint is /negotiate, API under /api

export const ChatClientProvider: React.FC<ChatClientProviderProps> = ({ children }) => {
  const settingsContext = useContext(ChatSettingsContext);

  const [client, setClient] = React.useState<ChatClient | null>(null);
  const clientRef = React.useRef<ChatClient | null>(null); // Add ref for stable reference
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
  const setUiNoticeRef = React.useRef(setUiNotice);
  React.useEffect(() => {
    setUiNoticeRef.current = setUiNotice;
  }, []);
  // Unread message counts per room
  const [unreadCounts, setUnreadCounts] = React.useState<Record<string, number>>({});
  // Force re-render trigger for room message updates
  const [roomMessagesUpdateTrigger, setRoomMessagesUpdateTrigger] = React.useState(0);
  // reconnectSeq increments on each (re)connection so we can trigger refetch logic per roomState
  const [reconnectSeq, setReconnectSeq] = React.useState(0);
  // Refs to guard against double-initialize within the same tick and across effect re-runs
  const initStartedRef = React.useRef(false);
  const connectingRef = React.useRef(false);
  // Login dialog state
  const [isLoginDialogOpen, setIsLoginDialogOpen] = React.useState(false);
  const [isLoggingIn, setIsLoggingIn] = React.useState(false);
  
  // Online status management
  const [onlineStatus, setOnlineStatus] = React.useState<OnlineStatus>({});
  const pingIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const onlineCheckIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  
  // Typing status management
  const [typingStatus, setTypingStatus] = React.useState<TypingStatus>({});
  const typingCheckIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  
  // Success notification management
  const [successNotification, setSuccessNotification] = React.useState<string>("");

  if (!settingsContext) {
    throw new Error("ChatClientProvider must be used within ChatSettingsProvider");
  }

  const { roomId, rooms, userId, setUserId, setRoomId } = settingsContext;
  // Keep setter refs stable to avoid capturing stale closures in event handlers
  const setUserIdRef = React.useRef(setUserId);
  React.useEffect(() => {
    setUserIdRef.current = setUserId;
  }, [setUserId]);
  const setRoomsRef = React.useRef(settingsContext.setRooms);
  React.useEffect(() => {
    setRoomsRef.current = settingsContext.setRooms;
  }, [settingsContext.setRooms]);
  const setRoomIdRef = React.useRef(setRoomId);
  React.useEffect(() => {
    setRoomIdRef.current = setRoomId;
  }, [setRoomId]);

  // Refs for latest values (to avoid reconnections)
  const roomIdRef = React.useRef(roomId);
  const userIdRef = React.useRef(userId);
  const roomsRef = React.useRef(rooms);

  // Update refs when values change
  React.useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);
  
  React.useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);
  
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
    
    // Clear unread count for the newly active room
    setUnreadCounts(prev => {
      if (prev[roomId] > 0) {
        const updated = { ...prev };
        delete updated[roomId];
        return updated;
      }
      return prev;
    });
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
    
    // Trigger re-render for room list sorting when messages are updated
    if (action.type === "completeMessage" || action.type === "userMessage" || action.type === "streamEnd") {
      setRoomMessagesUpdateTrigger(prev => prev + 1);
    }
    
    // Update unread count if this is not the current active room and it's a new message
    const isCurrentRoom = roomKey === roomIdRef.current;
    if (!isCurrentRoom && (action.type === "completeMessage" || action.type === "streamEnd")) {
      setUnreadCounts(prevCounts => ({
        ...prevCounts,
        [roomKey]: (prevCounts[roomKey] || 0) + 1
      }));
    }
    
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

  // Helper: fetch history for a specific room
  const fetchRoomHistory = React.useCallback(async (client: ChatClient, targetRoomId: string, skipGlobalMetadata: boolean = true) => {
    // Skip global metadata room
    if (skipGlobalMetadata && targetRoomId === GLOBAL_METADATA_ROOM_ID) return;
    
    const rs = ensureRoomState(targetRoomId);
    if (rs.loaded && rs.lastFetchSeq >= reconnectSeq) {
      console.log(`Room ${targetRoomId} history already loaded`);
      return;
    }
    
    try {
      console.log(`Fetching history for room: ${targetRoomId}`);
      const roomHistory = await client.listRoomMessage(targetRoomId, null, null, 100);
      console.log("fetchRoomHistory result:", roomHistory);
      const mapped: ChatMessage[] = (roomHistory.messages.reverse() ?? []).map((m: { messageId?: string; createdBy?: string; content?: { text?: string; binary?: string }; createdAt?: string }) => {
        const rawFrom = (m.createdBy && String(m.createdBy).trim().length > 0) ? m.createdBy : undefined;
        const sender = rawFrom ?? "Unknown sender";
        return {
          id: String(m.messageId ?? Date.now() + Math.random()),
          content: String(m.content?.text ?? ""),
          sender,
          timestamp: m.createdAt ?? new Date().toISOString(),
          isFromCurrentUser: rawFrom !== undefined && rawFrom === userIdRef.current,
          isAcked: true,
        } as ChatMessage;
      });
      
      rs.messages = mapped;
      rs.loaded = true;
      rs.lastFetchSeq = reconnectSeq;
      rs.isStreaming = false;
      
      // If this is the currently active room, update the UI
      if (roomIdRef.current === targetRoomId) {
        dispatch({ type: "setAll", payload: mapped });
      }
      
      console.log(`Loaded ${mapped.length} messages for room ${targetRoomId}`);
    } catch (e) {
      console.log(`Failed to fetch history for room ${targetRoomId}:`, e);
    }
  }, [ensureRoomState, reconnectSeq]);

  // Helper: fetch history for all rooms
  const fetchAllRoomsHistory = React.useCallback(async (client: ChatClient, rooms: { roomId: string }[]) => {
    console.log(`Fetching history for ${rooms.length} rooms`);
    const fetchPromises = rooms.map(room => fetchRoomHistory(client, room.roomId));
    await Promise.allSettled(fetchPromises);
    console.log('Finished fetching all room histories');
  }, [fetchRoomHistory]);

  // Send message function
  const sendMessage = React.useCallback(
    async (messageText: string) => {
      console.log(`sendMessage for client, message =  ${messageText}, roomIdRef = ${roomIdRef}, client = `, client);
      if (!client || !messageText.trim()) return;

      // Add user message with isAcked=false
      const userMessageId = Date.now().toString();
      updateRoomMessages(roomIdRef.current, { type: "userMessage", payload: { id: userMessageId, content: messageText, userId: userIdRef.current ?? "" } });

      try {
        const sent = await client.sendToRoom(roomIdRef.current, messageText);
        console.log(`Successfully sendToRoom, roomId = ${roomIdRef.current}, messageId = ${sent}`);
        
        // Mark message as acknowledged after successful send
        updateRoomMessages(roomIdRef.current, { type: "updateMessageAck", payload: { messageId: userMessageId, isAcked: true } });
      } catch (err: unknown) {
        const msg = `Error sending message: ${err instanceof Error ? err.message : "Unknown error"}`;
        setUiNoticeRef.current({ type: "error", text: msg });
        // Message remains unacknowledged (isAcked=false) on error
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
      
      // Show login dialog if no userId is set
      if (!userId) {
        setIsLoginDialogOpen(true);
        return;
      }

      connectingRef.current = true;
      // Keep state writes minimal to avoid retriggers

      try {
        setConnectionStatus({ status: "connecting", message: "Connecting..." });
        setUiNoticeRef.current(undefined);

        // Stop existing client if any
        if (clientRef.current) {
          try {
            await clientRef.current.stop();
          } catch (err) {
            console.error("Error stopping previous client:", err);
          }
        }

        // Use the userId from context (set via login dialog)
        // Create new client with initial roomId; no user id)
        const newChatClient = new ChatClient({
          getClientAccessUrl: async () => {
            const url = `/api/negotiate?userId=${userId}`;
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error(`Negotiation failed: ${response.statusText}`);
            }
            const body = (await response.json()) as { url?: string };
            if (!body?.url || typeof body.url !== 'string') {
              throw new Error('Negotiation failed: invalid response shape');
            }
            return body.url;
          },
        });

        // Assign clientRef before starting to prevent parallel starts from racing
        // const newChatClient = new ChatClient(newClient); //await ChatClient.login(newClient);
        // Set up event listeners using refs for latest values
        newChatClient.onConnected((e: { connectionId: string; userId?: string }) => {
          setConnectionStatus({
            status: "connected",
            message: "Connected",
            connectionId: e.connectionId,
            userId: e.userId,
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
        newChatClient.onDisconnected(() => {
          setConnectionStatus({
            status: "disconnected",
            message: `Disconnected: Connection closed`,
          });
          setUiNoticeRef.current({ type: "error", text: "Disconnected: Connection closed" });
        });


        newChatClient.addListenerForNewMessage((notification) => {
          console.log("New message notification:", notification);
          const message = notification.message;
          console.log(`Received new message from ${message.createdBy}, content = ${message.content?.text}, isSelf = ${message.createdBy === newChatClient.userId}`);
          
          // Handle ping messages for online status
          if (notification.conversation.roomId === GLOBAL_METADATA_ROOM_ID && message.content?.text === "ping") {
            if (message.createdBy) {
              setOnlineStatus(prev => {
                const updated = {
                  ...prev,
                  [message.createdBy!]: {
                    isOnline: true,
                    lastSeen: Date.now()
                  }
                };
                return updated;
              });
            }
            return; // Don't show ping messages in the UI
          }
          
          // Handle typing indicator messages
          // Format: "typing:roomId"
          if (notification.conversation.roomId === GLOBAL_METADATA_ROOM_ID && message.content?.text?.startsWith("typing:")) {
            const targetRoomId = message.content.text.substring(7); // Remove "typing:" prefix
            if (message.createdBy && message.createdBy !== newChatClient.userId) {
              const visitorKey = `${targetRoomId}:${message.createdBy}`;
              setTypingStatus(prev => ({
                ...prev,
                [visitorKey]: {
                  isTyping: true,
                  lastTyping: Date.now()
                }
              }));
            }
            return; // Don't show typing messages in the UI
          }
          
          if (message.createdBy === newChatClient.userId) return ;
          updateRoomMessages(notification.conversation.roomId!, { type: "completeMessage", payload: { 
            messageId: message.messageId,
            content: message.content?.text || "", 
            sender: message.createdBy || "Unknown Sender",
            isFromCurrentUser: false
          } });
        });

        newChatClient.addListenerForNewRoom((room) => {
          console.log('New room created/joined:', room);
          
          // Skip global metadata room - it should never appear in the sidebar
          if (room.roomId === GLOBAL_METADATA_ROOM_ID) {
            return;
          }
          
          // Check if room already exists to prevent duplicates
          const existingRoom = roomsRef.current.find(r => r.roomId === room.roomId);
          if (existingRoom) {
            console.log(`Room ${room.roomId} already exists, skipping duplicate add`);
            return;
          }
          
          setRoomsRef.current([...roomsRef.current, {
            roomId: room.roomId,
            roomName: room.title,
            userId: newChatClient.userId || "unknown"
          }]);
          
          // Show UI notification that user has been added to a new room
          console.log(`User ${newChatClient.userId} has been added to room: ${room.title}`);
          setUiNoticeRef.current({ type: "info", text: `🎉 You have been added to room: ${room.title}` });
          setSuccessNotification(`You have been added to room: ${room.title}`);
          
          // Auto-clear the notification after 5 seconds
          setTimeout(() => {
            setUiNoticeRef.current(undefined);
            setSuccessNotification("");
          }, 5000);
          
          // Fetch history for the new room
          fetchRoomHistory(newChatClient, room.roomId).catch(err => {
            console.error(`Failed to fetch history for new room ${room.roomId}:`, err);
          });
        });
        await newChatClient.login();

        const initRooms = [
          {id: DEFAULT_ROOM_ID, name: DEFAULT_ROOM_NAME}, 
          {id: `private-${userId}-${userId}`, name: `${userId} (You)`},
        ];
        for (const r of initRooms) {
          await newChatClient.createRoom(r.name, [], r.id)
            .then((room) => { console.log('newly created room:', room); })
            .catch(async (createErr) => {
              console.log('failed to create roomId: ', r.id, 'error:', createErr);
              console.log("try to add user to existing room", r.id, "userId:", userId);
              // If room already exists, add current user to it
              return await newChatClient.addUserToRoom(r.id, userId);
            })
            .catch((addErr) => { console.log('failed to add user to default room:', addErr); });
        };

        const roomMetadatas: RoomMetadata[] = newChatClient.rooms
          .filter(r => r.roomId !== GLOBAL_METADATA_ROOM_ID) // Hide global metadata room from UI
          .map(r => ({ roomId: r.roomId, roomName: r.title, userId: "unknown" }));
        setRoomsRef.current(roomMetadatas);
        setRoomIdRef.current(DEFAULT_ROOM_ID);

        clientRef.current = newChatClient;

        setClient(newChatClient);
        setUserIdRef.current(newChatClient.userId);

        console.log(`chat client connected, userId = ${newChatClient.userId}`);
        
        // Fetch history for all rooms after initialization
        fetchAllRoomsHistory(newChatClient, newChatClient.rooms).catch(err => {
          console.error('Failed to fetch all room histories:', err);
        });
        
        // Mark initialized via ref only
        initStartedRef.current = true;
        
        // Send initial ping immediately to announce user is online
        newChatClient.sendToRoom(GLOBAL_METADATA_ROOM_ID, "ping").catch((err) => {
          console.error("Failed to send initial ping:", err);
        });
        
        // Start ping interval for online status
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
        }
        pingIntervalRef.current = setInterval(() => {
          if (clientRef.current) {
            clientRef.current.sendToRoom(GLOBAL_METADATA_ROOM_ID, "ping").catch((err) => {
              console.error("Failed to send ping:", err);
            });
          }
        }, PING_INTERVAL_MS);
        
        // Start online status check interval (every 5 seconds)
        if (onlineCheckIntervalRef.current) {
          clearInterval(onlineCheckIntervalRef.current);
        }
        onlineCheckIntervalRef.current = setInterval(() => {
          const now = Date.now();
          setOnlineStatus(prev => {
            const updated = { ...prev };
            let hasChanges = false;
            
            for (const [userId, status] of Object.entries(updated)) {
              // Mark as offline if no ping received within configured timeout
              if (status.isOnline && now - status.lastSeen > OFFLINE_TIMEOUT_MS) {
                updated[userId] = { ...status, isOnline: false };
                hasChanges = true;
              }
            }
            
            return hasChanges ? updated : prev;
          });
        }, 5000);
        
        // Start typing status check interval (every 1 second for responsiveness)
        if (typingCheckIntervalRef.current) {
          clearInterval(typingCheckIntervalRef.current);
        }
        typingCheckIntervalRef.current = setInterval(() => {
          const now = Date.now();
          setTypingStatus(prev => {
            const updated = { ...prev };
            let hasChanges = false;
            
            for (const [visitorKey, status] of Object.entries(updated)) {
              // Mark as not typing if no typing indicator received within configured timeout
              if (status.isTyping && now - status.lastTyping > TYPING_TIMEOUT_MS) {
                updated[visitorKey] = { ...status, isTyping: false };
                hasChanges = true;
              }
            }
            
            return hasChanges ? updated : prev;
          });
        }, 1000);
      } catch (err: unknown) {
        const msg = `Connection Failed: ${err instanceof Error ? err.message : "Unknown error"}`;
        setConnectionStatus({ status: "error", message: msg });
        setUiNoticeRef.current({ type: "error", text: msg });
        // remain not initialized so we can retry later
      } finally {
        connectingRef.current = false;
      }
    };

    // Kick off initialization; guards above ensure single start (even under StrictMode)
    initializeClient();

    // Cleanup function to prevent multiple connections
    return () => {
      // Clear intervals
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (onlineCheckIntervalRef.current) {
        clearInterval(onlineCheckIntervalRef.current);
        onlineCheckIntervalRef.current = null;
      }
      if (typingCheckIntervalRef.current) {
        clearInterval(typingCheckIntervalRef.current);
        typingCheckIntervalRef.current = null;
      }
      
      if (clientRef.current) {
        try {
          clientRef.current.stop();
        } catch (error) {
          console.error("Error stopping client:", error);
        }
        clientRef.current = null;
      }
    };
  }, [userId, fetchRoomHistory, fetchAllRoomsHistory, updateRoomMessages]); // Add new dependencies

  // Handle room changes - just switch displayed messages, no need to fetch history
  React.useEffect(() => {
    if (!roomId) return;
    
    const rs = roomStatesRef.current.get(roomId);
    if (rs && rs.messages.length > 0) {
      dispatch({ type: "setAll", payload: rs.messages });
      rs.isStreaming = false;
    } else {
      dispatch({ type: "clear" });
    }
    
    // Clear unread count for the newly active room
    setUnreadCounts(prev => {
      if (prev[roomId] > 0) {
        const updated = { ...prev };
        delete updated[roomId];
        return updated;
      }
      return prev;
    });
  }, [roomId]);

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
  }, [roomId]);

  // Handle login dialog submission
  const handleLogin = React.useCallback(
    async (inputUserId: string, _password: string) => {
      setIsLoggingIn(true);
      try {
        // Here you can add authentication logic if needed
        // For now, we'll just accept the userId
        setUserIdRef.current(inputUserId);
        setIsLoginDialogOpen(false);
      } catch (err: unknown) {
        const msg = `Login Failed: ${err instanceof Error ? err.message : "Unknown error"}`;
        setUiNoticeRef.current({ type: "error", text: msg });
      } finally {
        setIsLoggingIn(false);
      }
    },
    [], // No dependencies needed since we use refs
  );

  // Helper function to get the last message for a room
  const getLastMessageForRoom = React.useCallback((roomId: string): ChatMessage | null => {
    const rs = roomStatesRef.current.get(roomId);
    if (!rs || rs.messages.length === 0) {
      return null;
    }
    return rs.messages[rs.messages.length - 1];
  }, []);

  // Send typing indicator to a specific room
  const sendTypingIndicator = React.useCallback((targetRoomId: string) => {
    if (clientRef.current && targetRoomId) {
      clientRef.current.sendToRoom(GLOBAL_METADATA_ROOM_ID, `typing:${targetRoomId}`).catch((err) => {
        console.error("Failed to send typing indicator:", err);
      });
    }
  }, []);

  // Get list of users who are typing in a specific room
  const getTypingUsersForRoom = React.useCallback((targetRoomId: string): string[] => {
    const typingUsers: string[] = [];
    for (const [visitorKey, status] of Object.entries(typingStatus)) {
      if (status.isTyping) {
        const [roomId, visitorUserId] = visitorKey.split(':');
        if (roomId === targetRoomId) {
          typingUsers.push(visitorUserId);
        }
      }
    }
    return typingUsers;
  }, [typingStatus]);

  const value = React.useMemo(
    () => ({
      client,
      connectionStatus,
      messages,
      isStreaming,
      sendMessage,
      clearMessages,
      uiNotice,
      unreadCounts,
      getLastMessageForRoom,
      roomMessagesUpdateTrigger,
      onlineStatus,
      typingStatus,
      sendTypingIndicator,
      getTypingUsersForRoom,
      successNotification,
      setSuccessNotification,
    }),
    [client, connectionStatus, messages, isStreaming, sendMessage, clearMessages, uiNotice, unreadCounts, getLastMessageForRoom, roomMessagesUpdateTrigger, onlineStatus, typingStatus, sendTypingIndicator, getTypingUsersForRoom, successNotification],
  );
  return (
    <>
      <LoginDialog
        isOpen={isLoginDialogOpen}
        onLogin={handleLogin}
        isLoading={isLoggingIn}
      />
      <ChatClientContext.Provider value={value}>{children}</ChatClientContext.Provider>
    </>
  );
};
