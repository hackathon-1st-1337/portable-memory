#!/usr/bin/env bash
set -e

# Run Cloudflare Quick Tunnel to expose the local Portable Memory app
echo "🚀 Launching Cloudflare Tunnel for Portable Memory (http://localhost:3000)..."
exec cloudflared tunnel --url http://localhost:3000
