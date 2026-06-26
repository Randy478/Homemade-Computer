import http.server
import socketserver
import os

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}")

print(f"RetroSim PCB Server")
print(f"Serving from: {DIRECTORY}")
print(f"Local: http://localhost:{PORT}")
print(f"")

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.serve_forever()
