#!/bin/bash
set -e

REPO_DIR="${1}"

if [ -z "$REPO_DIR" ]; then
    echo "[error] Usage: $0 <path-to-repo>" >&2
    exit 1
fi

if [ ! -d "$REPO_DIR" ]; then
    echo "[error] Repo dir not found: $REPO_DIR" >&2
    exit 1
fi

# Create venv if not present (Makefile auto-detects .venv/bin/python3)
if [ ! -f "${REPO_DIR}/.venv/bin/python3" ]; then
    echo "[setup] Creating virtual environment..."
    python3 -m venv "${REPO_DIR}/.venv"
fi

# Install/update requirements
echo "[setup] Installing requirements..."
"${REPO_DIR}/.venv/bin/pip" install -r "${REPO_DIR}/requirements.txt" --quiet --upgrade

# Generate lineage HTML
echo "[lineage] Running make generate_lineage..."
cd "${REPO_DIR}" && make generate_lineage

echo "[lineage] Done."
