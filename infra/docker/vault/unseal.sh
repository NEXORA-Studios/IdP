#!/bin/sh
# Vault entrypoint: start server in background, auto-unseal with operator-
# provided key shares, then keep running. Key shares come from the env file
# and are never written to disk inside the container.
set -e

vault server -config=/vault/config & SERVER_PID=$!

# Wait for the API to come up
until vault status >/dev/null 2>&1; do sleep 1; done

# Sealed unless previously unsealed; provide N key shares via env
if vault status -format=json | grep -q '"sealed":true'; then
  vault operator unseal "$VAULT_UNSEAL_KEY_1" >/dev/null
  [ -n "$VAULT_UNSEAL_KEY_2" ] && vault operator unseal "$VAULT_UNSEAL_KEY_2" >/dev/null
  [ -n "$VAULT_UNSEAL_KEY_3" ] && vault operator unseal "$VAULT_UNSEAL_KEY_3" >/dev/null
fi

wait $SERVER_PID
