#!/bin/bash
set -e
if [ ! -d node_modules ]; then
  echo "Installing dependencies first..."
  npm install
fi
npm start
