# AI Chat Demo

Simple real-time chat with AI responses using a custom Flask/WebSocket backend, with the client supports Azure Web PubSub client data protocol, enabling easy future Azure migration.

## Prerequisites
- Node.js >=16
- Python >=3.8
- GitHub token in `python-server/.env` (e.g., `GITHUB_TOKEN=...`)

## Quick Start
```bash
# Install server dependencies and start both services
cd python-server
pip install -r requirements.txt
python start_dev.py
```
This will run:
- API on http://localhost:5000
- WebSocket on ws://localhost:5001
- Client on http://localhost:5173

## Usage
- Open http://localhost:5173
- Default room: `public`
- To join another room, enter its ID in the sidebar

## Project Structure
```
chat-demo/
├── client/         # React + Vite frontend
└── python-server/  # Flask + WebSocket backend
```
