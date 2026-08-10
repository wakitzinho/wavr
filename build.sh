#!/bin/bash
set -e
echo "=== Wavr build ==="
echo "Installing dependencies..."
npm install
echo "Building AppImage..."
npm run build:linux
echo ""
echo "Done! Your AppImage is in: dist/"
ls dist/*.AppImage 2>/dev/null && echo "Run it with: ./dist/*.AppImage"
