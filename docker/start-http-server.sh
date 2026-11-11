#!/bin/sh
# Starts the hosted HTTP server. The New Relic agent loads only when the
# deployment provides a license key, so the image runs uninstrumented elsewhere.
set -eu

server_entrypoint="dist-http/http-server.js"

if [ -n "${NEW_RELIC_LICENSE_KEY:-}" ]; then
  exec node --import newrelic/esm-loader.mjs --require newrelic "$server_entrypoint"
fi

exec node "$server_entrypoint"
