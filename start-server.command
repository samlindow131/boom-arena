#!/bin/bash
# Double-click to host an online Boom Arena match on this Mac.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is needed to host. Install it from https://nodejs.org and double-click this again."
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi
node server.js
