"""
Development script to start both client and server for testing

This script will start:
1. React client (Vite dev server) on port 5173
2. Python server (Flask + WebSocket) on ports 5000/5001
"""
import subprocess
import os
import time
import signal
import sys
from pathlib import Path
from dotenv import load_dotenv
import runpy

# Load environment variables from .env file
load_dotenv()

def check_port_available(port: int) -> bool:
    """Check if a port is available"""
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(('localhost', port))
            return True
        except OSError:
            return False

def start_development() -> None:
    """Start both client and server for development"""
    print("🚀 Starting Chat Demo Development Environment")
    print("=" * 50)
    
    # Check required ports
    ports_to_check = [5000, 5001, 5173]
    for port in ports_to_check:
        if not check_port_available(port):
            print(f"❌ Port {port} is already in use!")
            print(f"   Please stop the process using port {port} and try again.")
            return
    
    # Get project root (one level up) and backend dir (this file's parent)
    backend_dir = Path(__file__).parent.resolve()
    root_dir = backend_dir.parent
    client_dir = root_dir / "client"
    
    # Check if directories exist
    if not client_dir.exists():
        print(f"❌ Client directory not found: {client_dir}")
        return
    
    print(f"📁 Client directory: {client_dir}")
    print(f"📁 Backend directory: {backend_dir}")
    
    # Optionally install client dependencies if missing
    node_modules = client_dir / 'node_modules'
    force_install = os.getenv('FORCE_NPM_INSTALL') in ('1','true','True')
    if force_install or not node_modules.exists():
        print("📦 Installing client dependencies (npm install)...")
        try:
            install_proc = subprocess.run([
                'npm','install'
            ], cwd=client_dir, shell=True, check=False)
            if install_proc.returncode != 0:
                print("⚠️  npm install exited with non-zero status; continuing anyway.")
            else:
                print("✅ npm install complete")
        except FileNotFoundError:
            print("❌ npm not found in PATH. Please install Node.js and rerun.")
            return

    # Start processes
    processes = []
    
    try:
        # Start Python server using our start_server.py script
        print("\n🐍 Starting Python server...")
        env = os.environ.copy()
        env["DEV"] = "1"  # Enable development mode (CORS, separate frontend dev server)
        
        # Use the start_server.py script to launch the server
        start_server_script = backend_dir / "start_server.py"
        server_process = subprocess.Popen([
            sys.executable, str(start_server_script)
        ], cwd=root_dir, shell=True, env=env)
        processes.append(("Python Server", server_process))
        time.sleep(2)
        
        # Start React client
        print("⚛️ Starting React client...")
        client_process = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=client_dir,
            shell=True
        )
        processes.append(("React Client", client_process))
        
        print("\n✅ Both services started!")
        print("\n💡 Environment Variables:")
        github_token = os.getenv('GITHUB_TOKEN')
        if github_token:
            print("   ✅ GITHUB_TOKEN is set")
        else:
            print("   ⚠️  GITHUB_TOKEN not set - AI features will not work")
            print("   💭 Set with: $env:GITHUB_TOKEN='your-token-here'")
        
        print("\n🛑 Press Ctrl+C to stop both services")
        
        # Wait for processes
        while all(p.poll() is None for _, p in processes):
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\n🛑 Stopping services...")
        for name, process in processes:
            print(f"   Stopping {name}...")
            process.terminate()
        
        # Wait for graceful shutdown
        time.sleep(2)
        
        # Force kill if needed
        for name, process in processes:
            if process.poll() is None:
                print(f"   Force stopping {name}...")
                process.kill()
        
        print("✅ All services stopped")
    
    except Exception as e:
        print(f"❌ Error: {e}")
        for name, process in processes:
            process.terminate()

if __name__ == "__main__":
    start_development()
