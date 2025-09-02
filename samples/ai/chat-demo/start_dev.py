#!/usr/bin/env python3
"""
Development script to start both client and server from the chat-demo root

Usage: run from anywhere, or execute this script directly from the chat-demo folder.
"""
import subprocess
import os
import time
import sys
from pathlib import Path
from dotenv import load_dotenv
import shutil

load_dotenv()


def check_port_available(port):
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(('localhost', port))
            return True
        except OSError:
            return False


def start_development():
    chat_demo_dir = Path(__file__).parent.resolve()
    client_dir = chat_demo_dir / 'client'
    server_dir = chat_demo_dir / 'python-server'

    print("🚀 Starting Chat Demo Development Environment (chat-demo root)")
    print("=" * 50)

    # Check required ports
    ports_to_check = [5000, 5001, 5173]
    for port in ports_to_check:
        if not check_port_available(port):
            print(f"❌ Port {port} is already in use! Please free it and retry.")
            return

    if not client_dir.exists():
        print(f"❌ Client directory not found: {client_dir}")
        return
    if not server_dir.exists():
        print(f"❌ Server directory not found: {server_dir}")
        return

    print(f"📁 Client directory: {client_dir}")
    print(f"📁 Server directory: {server_dir}")

    processes = []

    try:
        # Start Python server
        print("\n🐍 Starting Python server...")
        server_process = subprocess.Popen([
            sys.executable,
            'app.py'
        ], cwd=str(server_dir))
        processes.append(('Python Server', server_process))
        time.sleep(2)

        # Ensure client dependencies are installed (unless explicitly skipped)
        if os.environ.get('SKIP_CLIENT_INSTALL', '').lower() not in ('1', 'true', 'yes'):
            print('🔧 Installing client dependencies (npm install)...')
            npm_bin = shutil.which('npm') or shutil.which('npm.cmd') or shutil.which('npm.ps1')
            prev_cwd = os.getcwd()
            try:
                os.chdir(str(client_dir))
                if npm_bin:
                    try:
                        res = subprocess.run([npm_bin, 'install'])
                        if res.returncode != 0:
                            print(f'❌ npm install failed (exit {res.returncode}). Stopping server.')
                            try:
                                server_process.terminate()
                            except Exception:
                                pass
                            return
                    except Exception as e:
                        print(f'❌ npm install failed: {e}. Stopping server.')
                        try:
                            server_process.terminate()
                        except Exception:
                            pass
                        return
                else:
                    # fallback: let the shell resolve npm (running in client dir)
                    try:
                        res = subprocess.run('npm install', shell=True)
                        if res.returncode != 0:
                            print(f'❌ npm install failed (exit {res.returncode}). Stopping server.')
                            try:
                                server_process.terminate()
                            except Exception:
                                pass
                            return
                    except Exception as e:
                        print('❌ npm executable not found or failed to run via shell. Ensure Node.js/npm is on PATH.')
                        try:
                            server_process.terminate()
                        except Exception:
                            pass
                        return
            finally:
                os.chdir(prev_cwd)

        # Start React client
        print("⚛️ Starting React client...")
        npm_bin = shutil.which('npm') or shutil.which('npm.cmd') or shutil.which('npm.ps1')
        if npm_bin:
            client_process = subprocess.Popen([npm_bin, 'run', 'dev'], cwd=str(client_dir))
        else:
            client_process = subprocess.Popen('npm run dev', cwd=str(client_dir), shell=True)
        processes.append(('React Client', client_process))

        print('\n✅ Both services started!')
        print('  • React Client: http://localhost:5173')
        print('  • Python API: http://localhost:5000')
        print('  • WebSocket: ws://localhost:5001')

        print('\nPress Ctrl+C to stop both services')

        while all(p.poll() is None for _, p in processes):
            time.sleep(1)

    except KeyboardInterrupt:
        print('\n🛑 Stopping services...')
        for name, p in processes:
            try:
                p.terminate()
            except Exception:
                pass
        time.sleep(2)
        for name, p in processes:
            if p.poll() is None:
                try:
                    p.kill()
                except Exception:
                    pass
        print('✅ All services stopped')

    except Exception as e:
        print(f'❌ Error: {e}')
        for name, p in processes:
            try:
                p.terminate()
            except Exception:
                pass


if __name__ == '__main__':
    start_development()
