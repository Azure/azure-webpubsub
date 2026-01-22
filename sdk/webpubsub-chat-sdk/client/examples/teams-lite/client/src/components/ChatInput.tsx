import React, { useRef, useState, useCallback, useContext, useEffect } from "react";
import { useChatClient } from "../hooks/useChatClient";
import { useTextareaAutosize } from "../hooks/useTextareaAutosize";
import { ChatRoomContext } from "../contexts/ChatRoomContext";

export const ChatInput: React.FC = () => {
  const { sendMessage, connectionStatus, isStreaming, sendTypingIndicator } = useChatClient();
  const chatRoom = useContext(ChatRoomContext);
  const roomId = chatRoom?.room?.id;
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const lastTypingSentRef = useRef<number>(0);

  // Auto-size input
  useTextareaAutosize(inputRef, input);

  const isConnected = connectionStatus.status === 'connected';
  // Lock sending while AI is streaming a response to avoid overlapping questions
  const canSend = input.trim().length > 0 && isConnected && !isStreaming;

  // Send typing indicator when user is typing (throttled to every 2 seconds)
  useEffect(() => {
    if (input.trim().length > 0 && roomId && isConnected) {
      const now = Date.now();
      if (now - lastTypingSentRef.current > 2000) {
        sendTypingIndicator(roomId);
        lastTypingSentRef.current = now;
      }
    }
  }, [input, roomId, isConnected, sendTypingIndicator]);

  const onSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    const text = input.trim();
    setInput("");
    void sendMessage(text);
  }, [input, canSend, sendMessage]);

  // Keyboard: Enter to send, Shift+Enter for newline
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) {
        const text = input.trim();
        setInput("");
        void sendMessage(text);
      }
    }
  }, [input, canSend, sendMessage]);

  return (
    <form className="input-area" onSubmit={onSubmit}>
      <textarea
        id="chat-input"
        ref={inputRef}
        className="message-input"
    placeholder={isConnected ? (isStreaming ? "Assistant is responding…" : "Type a message… (Shift+Enter for newline)") : "Connecting…"}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
    disabled={!isConnected}
    aria-disabled={!isConnected}
      />
      <button
        type="submit"
        className="send-button"
        disabled={!canSend}
        aria-label="Send message"
        title="Send"
      >
        <span aria-hidden>➤</span>
      </button>
    </form>
  );
};
