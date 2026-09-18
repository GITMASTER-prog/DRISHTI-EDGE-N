#!/usr/bin/env python3
"""
DRISHTI GCS — Local HTTP Server & Launcher
Runs using Python 3 standard library with ZERO external dependencies.
"""

import http.server
import os
import socketserver
import subprocess
import sys
import threading
import webbrowser
from pathlib import Path

if sys.platform == "win32":
    try:
        # line_buffering=True ensures every print lands in server.log
        # immediately, so a crash never leaves us with an empty log.
        sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
        sys.stderr.reconfigure(encoding='utf-8', line_buffering=True)
    except Exception:
        pass

PORT = 8000
DIRECTORY = Path(__file__).resolve().parent

class GCSHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIRECTORY), **kwargs)

    def end_headers(self):
        # Enable CORS and disable caching for live development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

def launch_app_window(port):
    """Open the GCS in a standalone Chromium app window (Edge or Chrome).
    The window title bar and taskbar icon use the page favicon (assets/drishTI.ico).
    Returns the process handle, or None if no Chromium browser is available.
    """
    candidates = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ]
    for exe in candidates:
        if os.path.exists(exe):
            try:
                # Keep the app window's browser profile out of OneDrive-synced folders.
                profile = os.path.join(os.environ.get("LOCALAPPDATA", str(DIRECTORY)), "DRISHTI_GCS_AppWindow")
                return subprocess.Popen([
                    exe,
                    f"--app=http://localhost:{port}",
                    f"--user-data-dir={profile}",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--window-size=1600,900",
                ])
            except OSError as exc:
                print(f"[WARN] Could not launch {exe}: {exc}")
    return None

def run_server(open_browser=True, test_mode=False):
    os.chdir(DIRECTORY)
    
    # Check if port is available or increment
    global PORT
    while True:
        try:
            with socketserver.TCPServer(("", PORT), GCSHTTPHandler) as httpd:
                print("=" * 60)
                print(f"[DRISHTI GCS] Rotax 914 Engine Digital Twin Server")
                print(f"Serving GCS interface at: http://localhost:{PORT}")
                print(f"Root directory: {DIRECTORY}")
                print("=" * 60)
                
                if test_mode:
                    print("Test mode: Server successfully bound to port. Exiting.")
                    return True

                app_process = launch_app_window(PORT) if open_browser else None

                if app_process:
                    # Standalone app window mode: serve until the window is closed.
                    print("App window opened. Close the window to stop the server.")
                    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
                    thread.start()
                    try:
                        app_process.wait()
                    finally:
                        httpd.shutdown()
                    print("App window closed. Server stopped. Goodbye!")
                    return

                # Fallback: no Chromium found, open in default browser as before.
                if open_browser:
                    webbrowser.open(f"http://localhost:{PORT}")

                print("Press Ctrl+C to terminate.")
                httpd.serve_forever()
        except OSError:
            PORT += 1
            if PORT > 8020:
                print("Could not find an open port between 8000-8020.")
                return False
        except KeyboardInterrupt:
            print("\nServer stopped by user (Ctrl+C). Goodbye!")
            return
        except Exception:
            # Anything unexpected must land in server.log (run.bat shows the
            # tail of this file when the process keeps dying).
            import traceback
            print("[ERROR] Unexpected server crash:")
            traceback.print_exc()
            raise

if __name__ == "__main__":
    test = "--test" in sys.argv
    no_browser = "--no-browser" in sys.argv
    run_server(open_browser=not (test or no_browser), test_mode=test)
