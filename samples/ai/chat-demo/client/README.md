## Chat Demo Web Client

Lightweight React + TypeScript + Vite frontend for the AI chat demo. Connects to the backend through Azure Web PubSub client protocol for real‑time, streaming AI responses and multi‑room chat.

### Features
* Streaming AI responses with placeholder while thinking
* Multiple rooms (default: `public`) – create / switch / remove (except `public`)
* Instant room switching with cached history
* Basic connection + error banner
* Markdown (sanitized) + inline formatting
* TailwindCSS utility styling

### Dependencies

- **React 19**: Core React library
- **@azure/web-pubsub-client**: Azure Web PubSub client for real-time messaging
- **marked**: Markdown parsing library
- **dompurify**: HTML sanitization for security
- **TypeScript**: Type safety and development experience

### Quick Start
Prereqs: Node.js 18+ and the server running at http://localhost:5000 by default.

```bash
cd client
npm install
npm run dev
```
Open http://localhost:5173

### Scripts
* `npm run dev` – Vite dev server
* `npm run build` – Type check + production build
* `npm run preview` – Preview built assets
* `npm run lint` – ESLint (TS + React hooks rules)

### Configuration
* Backend base URL: `BACKEND_URL` in `src/lib/constants.ts` (defaults to `http://localhost:5000`)
* Persistent connection negotiate endpoint: `GET /negotiate?roomId={roomId}` (handled by backend)
* History fetch: `GET /api/rooms/{roomId}/messages?limit=50`

To change the backend target (e.g. when deployed), update `BACKEND_URL` or expose it as an environment variable and import it similarly.

### Component Structure

This React app uses context providers and modular components for real-time chat with AI.

#### Provider Hierarchy

```jsx
<React.StrictMode>
  <ChatSettingsProvider>
    <ChatClientProvider>
      <ChatApp />
    </ChatClientProvider>
  </ChatSettingsProvider>
</React.StrictMode>
```

#### Components

##### `ChatApp`
- Renders `<Sidebar />` and wraps `<ChatWindow />` inside `<ChatRoomProvider />`

  ```jsx
  <div className="app-container">
    <Sidebar />
    <ChatRoomProvider>
      <ChatWindow />
    </ChatRoomProvider>
  </div>
  ```

##### Core Components

- **`Sidebar`**: Room list and add/join controls
- **`ChatWindow`**: Chat area
  - **`ChatHeader`**: Title and connection status
  - **`ChatMessages`**: Message stream with auto-scroll
    - **`MessageComponent`**: Renders each message
    - **`TypingIndicator`**: Shows AI typing
  - **`ChatInput`**: Textarea and send button

##### Context Providers

- **ChatSettingsProvider** (`ChatSettingsContext`): manages current `roomId` and list of rooms
- **ChatClientProvider** (`ChatClientContext`): handles WebSocket connection, messages state, streaming
- **ChatRoomProvider** (`ChatRoomContext`): maintains active room context (used in `ChatApp`)

#### Key Features

##### Message Handling
- **Streaming Messages**: Real-time message streaming with cursor animation
- **Markdown Support**: Full markdown rendering with DOMPurify sanitization
- **Message Types**: User messages, bot messages, system messages
- **Animations**: Smooth fade-in animations and completion effects

##### Connection Management
- **Auto-connection**: Automatic WebPubSub connection on app load
- **Status Indicators**: Visual connection status with error handling
- **Reconnection**: Graceful handling of connection failures

##### User Experience
- **Typing Indicators**: Animated typing indicators during message streaming
- **Auto-scroll**: Automatic scrolling to new messages
- **Responsive Design**: Mobile-friendly interface
- **Keyboard Support**: Enter to send, Shift+Enter for line breaks

### Project Structure
```
src/
  components/      UI pieces (messages list, input, sidebar, headers)
  contexts/        React contexts (settings, client, theme, etc.)
  providers/       Higher-level state + WebPubSub wiring
  reducers/        Message state reducer
  hooks/           Reusable hooks (auto-scroll, theme, chat client)
  utils/           Formatting + room helpers + storage
  lib/             Constants & generic helpers
public/            Static assets
```

### How It Works (Brief)
1. `ChatClientProvider` negotiates a Web PubSub client connection per browser session.
2. Rooms are joined (as groups) dynamically; server broadcasts streaming chunks.
3. Messages are cached per room for instant switching; history fetched once per room per connection.
4. Markdown is parsed (short messages fast‑path) then sanitized before render.

### Next Steps

Deploy the backend + static build, point `BACKEND_URL` to the deployed API, then run:

```bash
npm run build
```
