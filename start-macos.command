#!/usr/bin/env bash
# PurrScription - one-click startup for macOS.
# Double-click this file in Finder, or run `./start-macos.command` in Terminal.
set -euo pipefail

# Resolve the directory this script lives in (works when double-clicked from Finder).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
info() { printf "\033[36m%s\033[0m\n" "$1"; }
warn() { printf "\033[33m%s\033[0m\n" "$1"; }
err()  { printf "\033[31m%s\033[0m\n" "$1"; }

echo
bold "PurrScription - macOS quick start"
echo "Root: $ROOT"
echo

if [[ "$(uname -s)" != "Darwin" ]]; then
  warn "This launcher is meant for macOS. On Linux use ./start.sh, on Windows use start.ps1."
fi

# Make sure Homebrew's bin dirs are on PATH for this session (Apple Silicon + Intel).
for brew_bin in /opt/homebrew/bin /usr/local/bin; do
  [[ -d "$brew_bin" ]] && case ":$PATH:" in *":$brew_bin:"*) ;; *) PATH="$brew_bin:$PATH" ;; esac
done
export PATH

have() { command -v "$1" >/dev/null 2>&1; }

ensure_homebrew() {
  if have brew; then return 0; fi
  warn "Homebrew is not installed."
  read -r -p "Install Homebrew now? [y/N] " reply
  if [[ "${reply:-N}" =~ ^[Yy]$ ]]; then
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    for brew_bin in /opt/homebrew/bin /usr/local/bin; do
      [[ -x "$brew_bin/brew" ]] && eval "$("$brew_bin/brew" shellenv)"
    done
  else
    err "Homebrew is required to auto-install dependencies. Install Node 18+ and Python 3.12+ manually, then re-run."
    exit 1
  fi
}

# --- Node.js 18+ ---
NODE_OK=false
if have node; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  [[ "$NODE_MAJOR" -ge 18 ]] && NODE_OK=true
fi
if ! $NODE_OK; then
  warn "Node.js 18+ not found."
  ensure_homebrew
  info "Installing Node.js via Homebrew..."
  brew install node
fi

# --- Python 3.12+ ---
PY=""
if have python3; then
  PY_MINOR="$(python3 -c 'import sys; print(sys.version_info[1])' 2>/dev/null || echo 0)"
  PY_MAJOR="$(python3 -c 'import sys; print(sys.version_info[0])' 2>/dev/null || echo 0)"
  if [[ "$PY_MAJOR" -eq 3 && "$PY_MINOR" -ge 12 ]]; then PY="python3"; fi
fi
if [[ -z "$PY" ]] && have python3.12; then PY="python3.12"; fi
if [[ -z "$PY" ]]; then
  warn "Python 3.12+ not found."
  ensure_homebrew
  info "Installing Python 3.12 via Homebrew..."
  brew install python@3.12
  have python3.12 && PY="python3.12" || PY="python3"
fi

info "Using Python: $($PY --version 2>&1)"
info "Using Node:   $(node --version 2>&1)"
echo

# Hand off to the shared launcher, forwarding any extra flags (e.g. --docker, --postgres).
chmod +x ./start.sh 2>/dev/null || true
info "Launching PurrScription..."
echo
exec ./start.sh "$@"
