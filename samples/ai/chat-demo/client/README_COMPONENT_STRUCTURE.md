# React Chat Application Component Structure

This React app uses context providers and modular components for real-time chat with AI.

## Provider Hierarchy

```jsx
<React.StrictMode>
  <ChatSettingsProvider>
    <ChatClientProvider>
      <ChatApp />
    </ChatClientProvider>
  </ChatSettingsProvider>
</React.StrictMode>
```

## Component Structure

### `ChatApp`
- Renders `<Sidebar />` and wraps `<ChatWindow />` inside `<ChatRoomProvider />`

```jsx
<div className="app-container">
  <Sidebar />
  <ChatRoomProvider>
    <ChatWindow />
  </ChatRoomProvider>
</div>
```

### Core Components

- **`Sidebar`**: Room list and add/join controls
- **`ChatWindow`**: Chat area
  - **`ChatHeader`**: Title and connection status
  - **`ChatMessages`**: Message stream with auto-scroll
    - **`MessageComponent`**: Renders each message
    - **`TypingIndicator`**: Shows AI typing
  - **`ChatInput`**: Textarea and send button

## Context Providers

- **ChatSettingsProvider** (`ChatSettingsContext`): manages current `roomId` and list of rooms
- **ChatClientProvider** (`ChatClientContext`): handles WebSocket connection, messages state, streaming
- **ChatRoomProvider** (`ChatRoomContext`): maintains active room context (used in `ChatApp`)

## Key Features

### Message Handling
- **Streaming Messages**: Real-time message streaming with cursor animation
- **Markdown Support**: Full markdown rendering with DOMPurify sanitization
- **Message Types**: User messages, bot messages, system messages
- **Animations**: Smooth fade-in animations and completion effects

### Connection Management
- **Auto-connection**: Automatic WebPubSub connection on app load
- **Status Indicators**: Visual connection status with error handling
- **Reconnection**: Graceful handling of connection failures

### User Experience
- **Typing Indicators**: Animated typing indicators during message streaming
- **Auto-scroll**: Automatic scrolling to new messages
- **Responsive Design**: Mobile-friendly interface
- **Keyboard Support**: Enter to send, Shift+Enter for line breaks

## File Structure

```
src/
├── components/
│   ├── ChatApp.tsx
│   ├── Sidebar.tsx
│   ├── ChatWindow.tsx
│   ├── ChatHeader.tsx
│   ├── ChatMessages.tsx
│   ├── MessageComponent.tsx
│   ├── TypingIndicator.tsx
│   └── ChatInput.tsx
├── providers/
│   ├── ChatSettingsProvider.tsx
│   ├── ChatClientProvider.tsx
│   └── ChatRoomProvider.tsx
├── contexts/
│   ├── ChatSettingsContext.ts
│   ├── ChatClientContext.ts
│   └── ChatRoomContext.ts
├── hooks/
│   └── useChatClient.ts
├── reducers/
│   └── messagesReducer.ts
├── utils/
│   ├── messageFormatting.ts
│   └── roomUtils.ts
└── main.tsx
```

## Dependencies

- **React 19**: Core React library
- **@azure/web-pubsub-client**: Azure Web PubSub client for real-time messaging
- **marked**: Markdown parsing library
- **dompurify**: HTML sanitization for security
- **TypeScript**: Type safety and development experience

## Usage

The application automatically connects to the WebPubSub service and provides a full-featured chat experience with:
- Real-time messaging
- AI assistant integration
- Markdown message formatting
- Streaming message support
- Professional UI with animations
- Mobile responsiveness

To customize the application, modify the provider configurations or extend the component hierarchy as needed.
