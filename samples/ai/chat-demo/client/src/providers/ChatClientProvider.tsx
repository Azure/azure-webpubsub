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
  const [isStreaming, setIsStreaming] = React.useState<boolean>(false);
  const [showTypingIndicator, setShowTypingIndicator] = React.useState<boolean>(false);
  const [isConnecting, setIsConnecting] = React.useState<boolean>(false);
  const [isInitialized, setIsInitialized] = React.useState<boolean>(false);

  if (!avatarContext || !settingsContext) {
    throw new Error("ChatClientProvider must be used within AvatarProvider and ChatSettingsProvider");
  }

  const { displayName } = avatarContext;
  const { roomId, enableTypingIndicators } = settingsContext;

  // Refs for latest values (to avoid reconnections)
  const displayNameRef = React.useRef(displayName);
  const enableTypingIndicatorsRef = React.useRef(enableTypingIndicators);
  const roomIdRef = React.useRef(roomId);

  // Update refs when values change
  React.useEffect(() => {
    displayNameRef.current = displayName;
  }, [displayName]);
  React.useEffect(() => {
    enableTypingIndicatorsRef.current = enableTypingIndicators;
  }, [enableTypingIndicators]);
  React.useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  // Send message function
  const sendMessage = React.useCallback(
    async (messageText: string) => {
      if (!client || !messageText.trim()) return;

      // Add user message
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        content: messageText,
        sender: displayNameRef.current,
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

      // For this UX, we only show the typing dots when streaming actually starts
      if (enableTypingIndicatorsRef.current) {
        setShowTypingIndicator(false);
      }

      // Reset streaming state
      setIsStreaming(false);

      try {
        await client.sendEvent(
          "sendToAI",
          {
            from: displayNameRef.current,
            message: messageText,
            timestamp: new Date().toISOString(),
            type: "user-message",
            roomId: roomIdRef.current,
          },
          "json",
        );
      } catch (err: unknown) {
        setShowTypingIndicator(false);
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
    setIsStreaming(false);
    setShowTypingIndicator(false);
  }, []);

  // Initialize client ONCE on mount - no reconnections needed
  React.useEffect(() => {
    const initializeClient = async () => {
      if (isConnecting || isInitialized) return; // Check both here
      setIsConnecting(true);

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

        // Create new client with initial roomId
        const newClient = new WebPubSubClient({
          getClientAccessUrl: async () => {
            const response = await fetch(`${backendUrl}/negotiate?roomId=${roomIdRef.current}`);
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
          setIsConnecting(false);
        });

        newClient.on("disconnected", () => {
          setConnectionStatus({
            status: "disconnected",
            message: `Disconnected: Connection closed`,
          });
          setIsConnecting(false);
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
          const isFromCurrentUser = sender === displayNameRef.current; // Use ref

          if (!isFromCurrentUser) {
            // Handle streaming end signal
            if (streaming && streamingEnd) {
              setIsStreaming(false);
              if (enableTypingIndicatorsRef.current) {
                setShowTypingIndicator(false);
              }
              // Mark the corresponding message as not streaming anymore
              if (messageId) {
                setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, streaming: false } : m)));
              }
              return;
            }

            // Handle streaming messages
            if (streaming) {
              setIsStreaming(true);
              if (enableTypingIndicatorsRef.current) {
                setShowTypingIndicator(true); // Show typing dots while receiving chunks
              }

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
                      isUser: false,
                      streaming: true,
                    };
                    return [...prev, newMessage];
                  }
                });
              }
              // If there's no content, we skip; local placeholder is already shown
            } else {
              // Complete non-streaming message (fallback)
              setIsStreaming(false);
              if (enableTypingIndicatorsRef.current) {
                setShowTypingIndicator(false);
              }

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
                      } as ChatMessage;
                      return prev.map((m, i) => (i === idx ? replaced : m));
                    }
                    // Add new complete message
                    const newMessage: ChatMessage = {
                      id: messageId || Date.now().toString(),
                      content: messageContent || "",
                      sender,
                      timestamp: new Date().toISOString(),
                      isUser: false,
                    };
                    return [...prev, newMessage];
                  }
                });
              }
            }
          }
        });

        await newClient.start();
        clientRef.current = newClient;
        setClient(newClient);
      } catch (err: unknown) {
        setConnectionStatus({
          status: "error",
          message: `Connection Failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        });
        setIsConnecting(false);
      }
    };

    // Only initialize if we have required contexts and haven't initialized yet
    if (displayNameRef.current && !isInitialized) {
      setIsInitialized(true);
      initializeClient();
    }

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
  }, [isInitialized, isConnecting]); // Include both dependencies

  // Handle room changes - clear messages when switching rooms
  React.useEffect(() => {
    if (client && roomId) {
      // Clear messages when switching to a new room
      setMessages([]);
      setIsStreaming(false);
      setShowTypingIndicator(false);

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
      }, 1200);
    }
  }, [connectionStatus.status, messages.length]);

  const value = React.useMemo(
    () => ({
      client,
      connectionStatus,
      messages,
      isStreaming,
      sendMessage,
      clearMessages,
      showTypingIndicator,
    }),
    [client, connectionStatus, messages, isStreaming, sendMessage, clearMessages, showTypingIndicator],
  );
  return <ChatClientContext.Provider value={value}>{children}</ChatClientContext.Provider>;
};
