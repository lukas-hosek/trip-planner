#!/usr/bin/env bash
# Starts the HTTPS dev server at https://localhost:8443/.
#   run_server.sh             runs it in the background and returns
#   run_server.sh --blocking  runs it in the foreground until stopped (used by F5 in VS Code)
# If it is already running, only prints the URL.
set -euo pipefail

BLOCKING=false
case "${1:-}" in
	"") ;;
	--blocking) BLOCKING=true ;;
	*) echo "Usage: $0 [--blocking]" >&2; exit 2 ;;
esac

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIRECTORY="$REPOSITORY_ROOT/.vscode/server"
PID_FILE="$SERVER_DIRECTORY/server.pid"
LOG_FILE="$SERVER_DIRECTORY/requests.log"
CERTIFICATE_FILE="$SERVER_DIRECTORY/localhost.pem"
KEY_FILE="$SERVER_DIRECTORY/localhost-key.pem"
PORT=8443
SERVER_URL="https://localhost:$PORT/"

mkdir -p "$SERVER_DIRECTORY"

# VS Code's serverReadyAction (launch.json) watches for this exact line to open the page.
READY_LINE="Dev server running: $SERVER_URL"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
	echo "Dev server already running."
	echo "$READY_LINE"
	exit 0
fi

if [ ! -f "$CERTIFICATE_FILE" ] || [ ! -f "$KEY_FILE" ]; then
	echo "No certificate in $SERVER_DIRECTORY. Run .vscode/setup_dev.sh once on this machine." >&2
	exit 1
fi

SERVER_PROGRAM=$(cat <<'PYTHON'
import functools
import http.server
import ssl
import sys

repository_root, port, certificate_file, key_file, ready_line = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4], sys.argv[5]


class DevRequestHandler(http.server.SimpleHTTPRequestHandler):
	# The browser must always revalidate, so edits show up on reload.
	def end_headers(self):
		self.send_header("Cache-Control", "no-cache")
		super().end_headers()


DevRequestHandler.extensions_map.update({".js": "text/javascript", ".webmanifest": "application/manifest+json"})
handler = functools.partial(DevRequestHandler, directory=repository_root)
server = http.server.ThreadingHTTPServer(("localhost", port), handler)
tls_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
tls_context.load_cert_chain(certificate_file, key_file)
server.socket = tls_context.wrap_socket(server.socket, server_side=True)
# Printed only once the socket is bound, so a browser opened on this line finds the server.
print(ready_line, flush=True)
try:
	server.serve_forever()
except KeyboardInterrupt:
	print("Dev server stopped.", flush=True)
PYTHON
)
SERVER_ARGUMENTS=("$REPOSITORY_ROOT" "$PORT" "$CERTIFICATE_FILE" "$KEY_FILE" "$READY_LINE")

if [ "$BLOCKING" = true ]; then
	# exec keeps this process's PID, so the PID file stays valid for stop_server.sh.
	echo $$ > "$PID_FILE"
	exec > >(tee -a "$LOG_FILE") 2>&1
	exec python3 -u -c "$SERVER_PROGRAM" "${SERVER_ARGUMENTS[@]}"
fi

nohup python3 -u -c "$SERVER_PROGRAM" "${SERVER_ARGUMENTS[@]}" >>"$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

sleep 0.5
if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
	echo "Dev server failed to start, see $LOG_FILE" >&2
	tail -5 "$LOG_FILE" >&2
	exit 1
fi
echo "$READY_LINE"
