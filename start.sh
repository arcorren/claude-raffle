#!/bin/bash
# Starts the claude-raffle with a public cloudflared tunnel for the QR code.
# Falls back to LAN-only if cloudflared is missing or the tunnel fails.

cd "$(dirname "$0")"
PORT="${PORT:-4747}"
TUNNEL_LOG="$(mktemp)"
CLOUDFLARED_PID=""

cleanup() {
  [ -n "$CLOUDFLARED_PID" ] && kill "$CLOUDFLARED_PID" 2>/dev/null
  rm -f "$TUNNEL_LOG"
}
trap cleanup EXIT

PUBLIC_URL=""
if command -v cloudflared >/dev/null 2>&1; then
  echo "Starting cloudflared tunnel..."
  # http2 (TCP) rides out venue-wifi hiccups better than the default QUIC,
  # which we saw drop with idle timeouts mid-event
  cloudflared tunnel --url "http://localhost:$PORT" --protocol http2 >"$TUNNEL_LOG" 2>&1 &
  CLOUDFLARED_PID=$!
  for _ in $(seq 1 30); do
    PUBLIC_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1)
    [ -n "$PUBLIC_URL" ] && break
    sleep 1
  done
  if [ -n "$PUBLIC_URL" ]; then
    echo "Tunnel up: $PUBLIC_URL"
  else
    echo "Tunnel didn't come up in 30s — falling back to LAN IP."
  fi
else
  echo "cloudflared not installed (brew install cloudflared) — falling back to LAN IP."
fi

PUBLIC_URL="$PUBLIC_URL" PORT="$PORT" node server.js
