import React, { useContext } from "react";
import type { ReactNode } from "react";
import { WebPubSubClient } from "@azure/web-pubsub-client";
import { ChatClientContext } from "../contexts/ChatClientContext";
import type { ChatMessage, ConnectionStatus } from "../contexts/ChatClientContext";
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
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [isStreamingState, setIsStreamingState] = React.useState<boolean>(false);
  // Refs to guard against double-initialize within the same tick and across effect re-runs
  const initStartedRef = React.useRef(false);
  const connectingRef = React.useRef(false);

  if (!avatarContext || !settingsContext) {
    throw new Error("ChatClientProvider must be used within AvatarProvider and ChatSettingsProvider");
  }

  const { userId, setUserId } = avatarContext;
  const { roomId } = settingsContext;

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

  // Send message function
  const sendMessage = React.useCallback(
    async (messageText: string) => {
      if (!client || !messageText.trim()) return;

      // Add user message
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        content: messageText,
        sender: userIdRef.current,
        timestamp: new Date().toISOString(),
        isUser: true,
      };
      setMessages((prev) => [...prev, userMessage]);

      // Show a local 'Thinking...' placeholder before AI starts streaming
      const thinkingMessage: ChatMessage = {
        id: `pending-${Date.now()}`,
        content: "Thinking...",
        sender: "AI Assistant",
        timestamp: new Date().toISOString(),
        isUser: false,
        streaming: true,
        isPlaceholder: true,
      };
      setMessages((prev) => [...prev, thinkingMessage]);
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
        const errorMessage: ChatMessage = {
          id: Date.now().toString(),
          content: `Error sending message: ${err instanceof Error ? err.message : "Unknown error"}`,
          sender: "System",
          timestamp: new Date().toISOString(),
          isUser: false,
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    },
    [client],
  ); // Only depend on client

  const clearMessages = React.useCallback(() => {
    setMessages([]);
    setIsStreamingState(false);
  }, []);

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
        });

        newClient.on("disconnected", () => {
          setConnectionStatus({
            status: "disconnected",
            message: `Disconnected: Connection closed`,
          });
        });

        newClient.on("group-message", (e) => {
          // Type assertion for WebPubSub message data structure
          const messageData = e.message.data as {
            messageId?: string;
            streaming?: boolean;
            streamingEnd?: boolean;
            message?: string;
            from?: string;
          };
          const messageId = messageData?.messageId;
          const streaming = !!messageData?.streaming;
          const streamingEnd = !!messageData?.streamingEnd;
          const messageContent = messageData?.message;
          const sender = messageData?.from || "AI Assistant";
          const isFromCurrentUser = sender === userIdRef.current; // Use ref

          // Handle streaming end signal
          if (streaming && streamingEnd) {
            setIsStreamingState(false);
            // Mark the corresponding message as not streaming anymore
            if (messageId) {
              setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, streaming: false } : m)));
            }
            return;
          }

          // Handle streaming messages
          if (streaming) {
            setIsStreamingState(true);

            if (messageId && messageContent) {
              // Create new streaming message or append to existing
              setMessages((prev) => {
                const existingIndex = prev.findIndex((msg) => msg.id === messageId);
                if (existingIndex >= 0) {
                  // If the existing message is a placeholder, replace it
                  const existing = prev[existingIndex];
                  if (existing.isPlaceholder) {
                    return prev.map((msg) => (msg.id === messageId ? { ...msg, content: messageContent || "", isPlaceholder: false } : msg));
                  } else {
                    return prev.map((msg) => (msg.id === messageId ? { ...msg, content: msg.content + (messageContent || "") } : msg));
                  }
                } else {
                  // No message with this id yet; try to replace the most recent placeholder
                  const lastPlaceholderIndex = [...prev].reverse().findIndex((m) => m.isPlaceholder);
                  if (lastPlaceholderIndex !== -1) {
                    const idx = prev.length - 1 - lastPlaceholderIndex;
                    const replaced = {
                      ...prev[idx],
                      id: messageId,
                      content: messageContent || "",
                      isPlaceholder: false,
                      sender,
                    } as ChatMessage;
                    return prev.map((m, i) => (i === idx ? replaced : m));
                  }
                  // Create new streaming message
                  const newMessage: ChatMessage = {
                    id: messageId || Date.now().toString(),
                    content: messageContent || "",
                    sender,
                    timestamp: new Date().toISOString(),
                    isUser: false, // streaming chunks are AI
                    streaming: true,
                  };
                  return [...prev, newMessage];
                }
              });
            }
            // If there's no content, we skip; local placeholder is already shown
          } else {
            // Complete non-streaming message (fallback)
            setIsStreamingState(false);

            if (messageId) {
              setMessages((prev) => {
                const existingIndex = prev.findIndex((msg) => msg.id === messageId);
                if (existingIndex >= 0) {
                  // Update existing message
                  return prev.map((msg) => (msg.id === messageId ? { ...msg, content: messageContent || "", streaming: false, isPlaceholder: false } : msg));
                } else {
                  // Replace most recent placeholder if present
                  const lastPlaceholderIndex = [...prev].reverse().findIndex((m) => m.isPlaceholder);
                  if (lastPlaceholderIndex !== -1) {
                    const idx = prev.length - 1 - lastPlaceholderIndex;
                    const replaced = {
                      ...prev[idx],
                      id: messageId,
                      content: messageContent || "",
                      isPlaceholder: false,
                      streaming: false,
                      sender,
                    } as ChatMessage; // keep existing isUser (placeholder is AI -> false)
                    return prev.map((m, i) => (i === idx ? replaced : m));
                  }
                  // Add new complete message
                  const newMessage: ChatMessage = {
                    id: messageId || Date.now().toString(),
                    content: messageContent || "",
                    sender,
                    timestamp: new Date().toISOString(),
                    isUser: isFromCurrentUser,
                  };
                  return [...prev, newMessage];
                }
              });
            }
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
  }, []);

  // Handle room changes - clear messages when switching rooms
  React.useEffect(() => {
    if (client && roomId) {
      // Clear messages when switching to a new room
      setMessages([]);
      setIsStreamingState(false);

      // Optionally send a room join message to the server
      // This tells the server which room this connection should listen to
      // (Your server would need to handle this message type)
    }
  }, [roomId, client]);

  // Add welcome message when connected
  React.useEffect(() => {
    if (connectionStatus.status === "connected" && messages.length === 0) {
      setTimeout(() => {
        const welcomeMessage: ChatMessage = {
          id: "welcome",
          content: "Hello! I'm your AI assistant. How can I help you today?",
          sender: "AI Assistant",
          timestamp: new Date().toISOString(),
          isUser: false,
        };
        setMessages([welcomeMessage]);
      }, 200);
    }
  }, [connectionStatus.status, messages.length]);

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
