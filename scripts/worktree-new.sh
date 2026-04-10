#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: scripts/worktree-new.sh <branch-name> [base-branch]"
  echo "Example: scripts/worktree-new.sh feature/admin-billing main"
  exit 1
fi

BRANCH_NAME="$1"
BASE_BRANCH="${2:-main}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Run this script from inside a git repository."
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
WORKTREES_DIR="${REPO_ROOT}/.worktrees"
TARGET_PATH="${WORKTREES_DIR}/${BRANCH_NAME}"

mkdir -p "$WORKTREES_DIR"

echo "Creating worktree at $TARGET_PATH from $BASE_BRANCH"
git fetch --all --prune
git worktree add -b "$BRANCH_NAME" "$TARGET_PATH" "$BASE_BRANCH"

echo ""
echo "Worktree created."
echo "Open it with:"
echo "  cd \"$TARGET_PATH\""
