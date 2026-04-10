#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: scripts/subtree-sync.sh <pull|push> <react-sdk|node-sdk> [branch]"
  exit 1
fi

ACTION="$1"
TARGET="$2"
BRANCH="${3:-main}"

case "$TARGET" in
  react-sdk)
    PREFIX="admin/packages/react-sdk"
    REMOTE_NAME="react-sdk"
    REMOTE_URL="git@github.com:querypanel/react-sdk.git"
    ;;
  node-sdk)
    PREFIX="admin/packages/node-sdk"
    REMOTE_NAME="node-sdk"
    REMOTE_URL="git@github.com:querypanel/node-sdk.git"
    ;;
  *)
    echo "Unknown subtree target: $TARGET"
    exit 1
    ;;
esac

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Run this script from inside a git repository."
  exit 1
fi

if ! git remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
  echo "Adding missing remote '$REMOTE_NAME' -> $REMOTE_URL"
  git remote add "$REMOTE_NAME" "$REMOTE_URL"
fi

if [[ "$ACTION" == "pull" ]]; then
  echo "Pulling subtree $TARGET from $REMOTE_NAME/$BRANCH into $PREFIX"
  git subtree pull --prefix="$PREFIX" "$REMOTE_NAME" "$BRANCH" --squash
elif [[ "$ACTION" == "push" ]]; then
  echo "Pushing subtree $TARGET from $PREFIX to $REMOTE_NAME/$BRANCH"
  git subtree push --prefix="$PREFIX" "$REMOTE_NAME" "$BRANCH"
else
  echo "Unknown action: $ACTION"
  exit 1
fi
