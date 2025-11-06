#!/usr/bin/env sh
set -euf
printf '[chat-demo] Prepackage (POSIX) starting\n'
cd "$(dirname "$0")/../client"
if [ -d node_modules ]; then
  echo 'Reusing existing node_modules'
else
  echo 'Installing dependencies'
  npm install
fi
echo 'Running build'
npm run build
cd ..
rm -rf python_server/static
mkdir -p python_server/static
cp -R client/dist/* python_server/static/
printf '[chat-demo] Prepackage (POSIX) completed\n'
