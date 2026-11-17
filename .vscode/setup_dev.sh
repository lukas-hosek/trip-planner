#!/usr/bin/env bash
# Prepares a Linux machine for TripMap development. Safe to run again: every step skips what is already done.
#   1. Makes the browsers trust mkcert's local certificate authority (system store, Chromium and VS Code, Firefox).
#   2. Creates the dev server's localhost certificate in .vscode/server/ (not versioned, because it holds a private key).
#   3. Creates the Python environment with Playwright for browser tests.
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIRECTORY="$REPOSITORY_ROOT/.vscode/server"
CERTIFICATE_FILE="$SERVER_DIRECTORY/localhost.pem"
KEY_FILE="$SERVER_DIRECTORY/localhost-key.pem"
NSS_DATABASE="$HOME/.pki/nssdb"
PLAYWRIGHT_ENVIRONMENT="$HOME/.venvs/tripmap"

missing_packages=()
command -v python3 >/dev/null || missing_packages+=(python3)
python3 -c "import ensurepip" 2>/dev/null || missing_packages+=(python3-venv)
command -v mkcert >/dev/null || missing_packages+=(mkcert)
command -v certutil >/dev/null || missing_packages+=(libnss3-tools)
if [ ${#missing_packages[@]} -gt 0 ]; then
	echo "Missing packages. Install them with: sudo apt install ${missing_packages[*]}" >&2
	exit 1
fi

# Chromium and VS Code's built-in browser trust only this database, and mkcert -install skips it while it doesn't exist.
if [ ! -d "$NSS_DATABASE" ]; then
	echo "Creating the NSS certificate database in $NSS_DATABASE"
	mkdir -p "$NSS_DATABASE"
	certutil -N -d "sql:$NSS_DATABASE" --empty-password
fi
echo "Installing mkcert's certificate authority (the first time, this asks for your password)"
mkcert -install

if [ -f "$CERTIFICATE_FILE" ] && [ -f "$KEY_FILE" ]; then
	echo "The certificate already exists in $SERVER_DIRECTORY"
else
	mkdir -p "$SERVER_DIRECTORY"
	mkcert -cert-file "$CERTIFICATE_FILE" -key-file "$KEY_FILE" localhost 127.0.0.1 ::1
fi

if [ -x "$PLAYWRIGHT_ENVIRONMENT/bin/python" ]; then
	echo "The Playwright environment already exists in $PLAYWRIGHT_ENVIRONMENT"
else
	echo "Creating the Playwright environment in $PLAYWRIGHT_ENVIRONMENT"
	python3 -m venv "$PLAYWRIGHT_ENVIRONMENT"
	"$PLAYWRIGHT_ENVIRONMENT/bin/pip" install --quiet playwright
	"$PLAYWRIGHT_ENVIRONMENT/bin/python" -m playwright install chromium
fi

echo "Done. Start the dev server with F5 in VS Code or with .vscode/run_server.sh."
