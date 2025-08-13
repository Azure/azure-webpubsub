# AI-Powered Chat Demo with Azure Web PubSub

A real-time chat application with AI integration, built with React and Python, compatible with Azure Web PubSub protocol.

## 🚀 Features

- **Real-time messaging** with WebSocket connections
- **AI-powered responses** using GitHub AI models
- **Room-based conversations** with persistent history
- **Multi-user support** with message broadcasting
- **Connection status indicators** with visual feedback
- **Streaming AI responses** for better user experience
- **Azure Web PubSub protocol compatibility**

## 🏗️ Architecture

### Frontend (React + TypeScript)
- **Vite** development server (port 5173)
- **Azure WebPubSubClient** for WebSocket connections
- **TailwindCSS** for styling
- **Connection management** with stable React hooks

### Backend (Python + Flask)
- **Flask HTTP server** (port 5000) for API endpoints
- **WebSocket server** (port 5001) for real-time messaging
- **AI integration** with GitHub AI models
- **Room-based conversation history** (in-memory storage)
## 📋 Prerequisites

- **Node.js** (16+ recommended)
- **Python** (3.8+ recommended)
- **GitHub Personal Access Token** with AI model access

## 🛠️ Setup Instructions

### 1. Clone and Navigate
```bash
cd chat-demo
```

### 2. Install Client Dependencies
```bash
cd client
npm install
```

### 3. Install Server Dependencies
```bash
cd ../python-server
pip install flask websockets openai python-dotenv
```

### 4. Set Environment Variables
Create a `.env` file in the `python-server` directory:
```env
GITHUB_TOKEN=your_github_token_here
API_VERSION=2024-08-01-preview
MODEL_NAME=gpt-4o-mini
```

**Note**: The application now uses python-dotenv to automatically load environment variables from the `.env` file. No need to set environment variables manually in PowerShell.

### 5. Start Development Environment

#### Option A: Auto-start both services
```bash
cd python-server
python start_dev.py
```

#### Option B: Start services manually

**Terminal 1 - Python Server:**
```bash
cd python-server
python app.py
```

**Terminal 2 - React Client:**
```bash
cd client
npm run dev
```

## 🌐 Access the Application

- **Chat Interface**: http://localhost:5173
- **Server API**: http://localhost:5000
- **WebSocket**: ws://localhost:5001

## 🧪 Testing

### Run Integration Tests
```bash
cd python-server
python test_integration.py
```

### Debug Endpoints
- **Room List**: GET http://localhost:5000/api/rooms
- **Room History**: GET http://localhost:5000/api/rooms/{room_id}/history

## 📝 Usage

1. **Open the chat interface** at http://localhost:5173
2. **Enter a room name** to join a conversation
3. **Send messages** - they'll be broadcasted to all users in the room
4. **AI responses** will be generated automatically and streamed back
5. **Conversation history** is maintained per room (last 20 messages)

## 🔧 Configuration

### AI Model Settings
The AI integration uses GitHub's AI models. Configure in `ai.py`:
- **Model**: `gpt-4o-mini` (default)
- **Max tokens**: 1000
- **Temperature**: 0.7

### WebSocket Protocol
Compatible with Azure Web PubSub:
- **Subprotocol**: `json.reliable.webpubsub.azure.v1`
- **Message format**: JSON with `type` and `data` fields

### Room Management
- **History limit**: 20 messages per room
- **Storage**: In-memory (resets on server restart)
- **Broadcasting**: All connected clients in the same room

## 🚨 Troubleshooting

### Client Issues
- **Infinite reloading**: Check React Hook dependencies in `ChatClientProvider`
- **Connection failures**: Verify WebSocket server is running on port 5001
- **UI not updating**: Check connection status in the header

### Server Issues
- **AI not responding**: Verify `GITHUB_TOKEN` is set correctly
- **Port conflicts**: Ensure ports 5000/5001 are available
- **Import errors**: Install all Python dependencies

### Common Solutions
```bash
# Check if ports are in use
netstat -an | findstr :5000
netstat -an | findstr :5001

# Restart with clean environment
python start_dev.py

# Test AI module separately
python -c "from ai import chat; print('AI module OK')"
```

## 📁 Project Structure

```
chat-demo/
├── client/                 # React frontend
│   ├── src/
│   │   ├── App.tsx        # Main app component
│   │   ├── ChatClientProvider.tsx  # WebSocket management
│   │   └── ChatHeader.tsx # Connection status UI
│   ├── package.json
│   └── vite.config.ts
└── python-server/         # Python backend
    ├── app.py            # Main server with AI integration
    ├── ai.py             # AI module with streaming
    ├── start_server.py   # Dual-server launcher
    ├── start_dev.py      # Development environment
    └── test_integration.py  # Integration tests
## 🤝 Contributing

Feel free to submit issues and enhancement requests!

## 📄 License

This project is for demonstration purposes.
