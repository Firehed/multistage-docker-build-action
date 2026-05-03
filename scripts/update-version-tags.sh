#!/bin/bash
set -euo pipefail

usage() {
    echo "Usage: $0 <tag> [--dry-run]"
    echo "  tag: semantic version tag (e.g., v1.2.3)"
    echo "  --dry-run: print commands without executing"
    exit 1
}

if [[ $# -lt 1 ]]; then
    usage
fi

TAG=$1
DRY_RUN=false

if [[ $# -ge 2 && $2 == "--dry-run" ]]; then
    DRY_RUN=true
fi

if [[ ! $TAG =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: tag must match vX.Y.Z format"
    exit 1
fi

MAJOR=$(echo "$TAG" | cut -d. -f1)
MINOR=$(echo "$TAG" | cut -d. -f1-2)

echo "Tag: $TAG"
echo "Major: $MAJOR"
echo "Minor: $MINOR"

run() {
    if $DRY_RUN; then
        echo "[dry-run] $*"
    else
        "$@"
    fi
}

run git tag --force --annotate "$MAJOR" --message "Update $MAJOR to $TAG"
run git tag --force --annotate "$MINOR" --message "Update $MINOR to $TAG"
run git push --force origin "$MAJOR" "$MINOR"
