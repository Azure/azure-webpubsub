#!/usr/bin/env python3
"""
Startup script for the AI-powered chat server

This script helps set up environment variables and start the server.
"""
import os
import sys
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

def setup_environment():
    """Set up environment variables for AI module"""
    print("🚀 Starting AI Chat Server")
    print("=" * 50)
    
    # Check for required environment variables
    required_env_vars = {
        'GITHUB_TOKEN': 'Your GitHub Personal Access Token',
        'API_VERSION': '2024-01-01 (optional, has default)',
        'MODEL_NAME': 'gpt-4o (optional, has default)'
    }
    
    missing_vars = []
    for var, description in required_env_vars.items():
        if var == 'GITHUB_TOKEN' and not os.environ.get(var):
            missing_vars.append(f"  {var}: {description}")
        elif var != 'GITHUB_TOKEN':
            current_value = os.environ.get(var, 'Not set (using default)')
            print(f"✅ {var}: {current_value}")
    
    if missing_vars:
        print("❌ Missing required environment variables:")
        for var in missing_vars:
            print(var)
        print("\nTo set environment variables:")
        print("  Windows: set GITHUB_TOKEN=your_token_here")
        print("  Linux/Mac: export GITHUB_TOKEN=your_token_here")
        print("\nGet your GitHub token from:")
        print("  https://github.com/settings/tokens")
        return False
    
    print("✅ All environment variables are set!")
    return True

def main():
    """Main startup function"""
    if not setup_environment():
        sys.exit(1)
    
    print("\n🤖 Features enabled:")
    print("  ✅ AI-powered responses with conversation history")
    print("  ✅ Streaming responses for real-time chat")
    print("  ✅ Room-based conversations with memory")
    print("  ✅ WebSocket support with Azure Web PubSub protocol")
    print("  ✅ Multi-client broadcasting")
    
    print("\n📊 Debug endpoints:")
    print("  GET /api/rooms - View all rooms")
    print("  GET /api/rooms/<room_id>/history - View room history")
    
    print("\n🌐 Starting servers...")
    
    # Import and run the main server
    try:
        from server import main as server_main
        import asyncio
        asyncio.run(server_main())
    except KeyboardInterrupt:
        print("\n👋 Server stopped by user")
    except Exception as e:
        print(f"\n❌ Server error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
