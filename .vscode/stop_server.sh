#!/usr/bin/env bash
# Stops the dev server started by run_server.sh.
set -euo pipefail

PID_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/server/server.pid"

if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
	kill "$(cat "$PID_FILE")"
	echo "Dev server stopped."
else
	echo "Dev server is not running."
fi
rm -f "$PID_FILE"
