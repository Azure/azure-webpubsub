# React Chat Application Component Structure

This React application has been transformed from a single HTML file into a modular component-based architecture using React providers and components.

## Provider Hierarchy

The application follows the requested provider structure:

```jsx
<React.StrictMode>
  <ThemeProvider>
    <AvatarProvider>
      <ChatSettingsProvider>
        <ChatClientProvider>
          <ChatApp />
        </ChatClientProvider>
      </ChatSettingsProvider>
    </AvatarProvider>
  </ThemeProvider>
</React.StrictMode>
```

## Component Structure

### Main App Component
- **`ChatApp`**: The main application container that wraps the chat window with a ChatRoomProvider

```jsx
<ChatRoomProvider name="my-first-room">
  <ChatWindow roomName="my-first-room" enableTypingIndicators={true} />
</ChatRoomProvider>
```

### Core Components

- **`ChatWindow`**: Main chat interface container
  - **`ChatHeader`**: Header with title and connection status
  - **`ChatMessages`**: Message list container with auto-scroll
    - **`MessageComponent`**: Individual message display with markdown support
    - **`TypingIndicator`**: Animated typing indicator
  - **`ChatInput`**: Message input with send functionality
  - **`ChatFooter`**: Footer with copyright information

## Context Providers

### 1. ThemeProvider
- Manages light/dark theme state
- Context: `ThemeContext`
- Hook: `useTheme`

### 2. AvatarProvider  
- Manages user avatar URL and display name
- Context: `AvatarContext`
- Hook: `useAvatar`

### 3. ChatSettingsProvider
- Manages room settings and preferences
- Context: `ChatSettingsContext`
- Features: roomId, typing indicators, message history settings

### 4. ChatClientProvider
- Manages WebPubSub client connection and chat state
- Context: `ChatClientContext`
- Hook: `useChatClient`
- Features:
  - WebPubSub client management
  - Message handling (streaming and complete messages)
  - Connection status tracking
  - Send message functionality

### 5. ChatRoomProvider
- Manages room-specific state
- Context: `ChatRoomContext`
- Features: room name, participant count, typing users

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
│   ├── ChatWindow.tsx
│   ├── ChatHeader.tsx
│   ├── ChatMessages.tsx
│   ├── MessageComponent.tsx
│   ├── TypingIndicator.tsx
│   ├── ChatInput.tsx
│   └── ChatFooter.tsx
├── providers/
│   ├── ThemeProvider.tsx
│   ├── AvatarProvider.tsx
│   ├── ChatSettingsProvider.tsx
│   ├── ChatClientProvider.tsx
│   └── ChatRoomProvider.tsx
├── contexts/
│   ├── ThemeContext.ts
│   ├── AvatarContext.ts
│   ├── ChatSettingsContext.ts
│   ├── ChatClientContext.ts
│   └── ChatRoomContext.ts
├── hooks/
│   ├── useTheme.ts
│   ├── useAvatar.ts
│   └── useChatClient.ts
├── utils/
│   └── messageFormatting.ts
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
