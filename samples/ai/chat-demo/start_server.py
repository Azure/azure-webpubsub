#!/usr/bin/env python3
"""
Start only the Python server from chat-demo root
"""
import os
import sys
from pathlib import Path

chat_demo_dir = Path(__file__).parent.resolve()
server_dir = chat_demo_dir / 'python_server'

# Ensure server directory is on sys.path so `from app import main` works
sys.path.insert(0, str(server_dir))


def setup_environment():
    required_env_vars = {
        'GITHUB_TOKEN': 'Your GitHub Personal Access Token',
        'API_VERSION': '2024-01-01 (optional, has default)',
        'MODEL_NAME': 'gpt-4o (optional, has default)'
    }
    missing = []
    for var, desc in required_env_vars.items():
        if var == 'GITHUB_TOKEN' and not os.environ.get(var):
            missing.append((var, desc))
        elif var != 'GITHUB_TOKEN':
            print(f"✅ {var}: {os.environ.get(var, 'Not set (using default)')}")

    if missing:
        print('❌ Missing required environment variables:')
        for v, d in missing:
            print(f'  {v}: {d}')
        return False
    print('✅ Environment OK')
    return True


def main():
    if not setup_environment():
        sys.exit(1)

    os.chdir(server_dir)
    try:
        from app import main as server_main
        import asyncio
        asyncio.run(server_main())
    except KeyboardInterrupt:
        print('\n👋 Server stopped by user')
    except Exception as e:
        print(f'\n❌ Server error: {e}')
        sys.exit(1)


if __name__ == '__main__':
    main()
