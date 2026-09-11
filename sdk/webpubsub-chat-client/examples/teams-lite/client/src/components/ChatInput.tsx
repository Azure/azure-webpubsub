import React, { useRef, useState, useCallback, useContext } from "react";
import { useChatClient } from "../hooks/useChatClient";
import { ChatRoomContext } from "../contexts/ChatRoomContext";
import { RichTextEditor } from "./RichTextEditor";
import type { RichTextEditorHandle } from "./RichTextEditor";

export const ChatInput: React.FC = () => {
  const { sendMessage, connectionStatus, isStreaming, sendTypingIndicator } = useChatClient();
  const chatRoom = useContext(ChatRoomContext);
  const roomId = chatRoom?.room?.id;
  const [hasContent, setHasContent] = useState(false);
  const editorRef = useRef<RichTextEditorHandle>(null);
  const lastTypingSentRef = useRef<number>(0);

  const isConnected = connectionStatus.status === 'connected';
  // Lock sending while AI is streaming a response to avoid overlapping questions
  const canSend = hasContent && isConnected && !isStreaming;

  // Handle content change for typing indicator
  const handleContentChange = useCallback((hasContent: boolean) => {
    setHasContent(hasContent);
    
    // Send typing indicator when user is typing (throttled to every 2 seconds)
    if (hasContent && roomId && isConnected) {
      const now = Date.now();
      if (now - lastTypingSentRef.current > 2000) {
        sendTypingIndicator(roomId);
        lastTypingSentRef.current = now;
      }
    }
  }, [roomId, isConnected, sendTypingIndicator]);

  const handleSubmit = useCallback(() => {
    if (!canSend || !editorRef.current) return;
    
    const html = editorRef.current.getHtml();
    const text = editorRef.current.getText().trim();
    
    if (!text) return;
    
    // Send HTML content (will be rendered on the receiving end)
    editorRef.current.clear();
    setHasContent(false);
    void sendMessage(html);
  }, [canSend, sendMessage]);

  const onSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    handleSubmit();
  }, [handleSubmit]);

  return (
    <form className="input-area rich-text-input-area" onSubmit={onSubmit}>
      <RichTextEditor
        ref={editorRef}
        placeholder={isConnected ? (isStreaming ? "Assistant is responding…" : "Type a message, Shift+Enter for newline…") : "Connecting…"}
        disabled={!isConnected}
        canSend={canSend}
        onSubmit={handleSubmit}
        onChange={handleContentChange}
      />
    </form>
  );
};
