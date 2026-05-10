#!/usr/bin/env python3
"""Stream local runner logs from the backend API to the terminal.

Usage:
  python scripts/local_runner_logs.py            # auto-pick last active/recent
  python scripts/local_runner_logs.py <id_prefix>  # specific execution by id prefix
"""

import json
import sqlite3
import sys
import urllib.request
from pathlib import Path

DB_PATH  = Path(__file__).parent.parent / "backend/executions.db"
API_BASE = "http://localhost:8000/api/executions"

# ANSI
CYAN   = "\033[36m"
GREEN  = "\033[32m"
YELLOW = "\033[33m"
RED    = "\033[31m"
BOLD   = "\033[1m"
DIM    = "\033[2m"
RESET  = "\033[0m"

STATUS_CLR = {
    "running":     YELLOW,
    "dispatching": YELLOW,
    "queued":      CYAN,
    "success":     GREEN,
    "failed":      RED,
    "canceled":    DIM,
}


def _s(status):
    return f"{STATUS_CLR.get(status, '')}{status:<12}{RESET}"


# ── DB query ──────────────────────────────────────────────────────────────────

def list_local(limit=15):
    if not DB_PATH.exists():
        print(f"{RED}DB no encontrada: {DB_PATH}{RESET}")
        return []
    with sqlite3.connect(DB_PATH) as con:
        return con.execute(
            """SELECT id, fase, variant, status, created_at
               FROM executions
               WHERE runner = 'Local'
               ORDER BY created_at DESC
               LIMIT ?""",
            (limit,),
        ).fetchall()


def print_table(rows):
    print(f"\n{BOLD}Ejecuciones locales recientes{RESET}")
    print(f"  {'#':<3} {'fase':<22} {'variant':<14} {'status':<12} {'created_at'}")
    print("  " + "─" * 68)
    for i, (id_, fase, variant, status, created_at) in enumerate(rows):
        ts = created_at[:19].replace("T", " ")
        short_id = id_[:8]
        print(f"  {i:<3} {fase:<22} {variant:<14} {_s(status)}  {ts}  {DIM}{short_id}{RESET}")
    print()


def pick(rows, prefix=None):
    if prefix:
        for r in rows:
            if r[0].startswith(prefix):
                return r
        print(f"{RED}No hay ejecución local que empiece por: {prefix}{RESET}")
        return None
    # Preferir running/dispatching/queued; si no, el más reciente
    for r in rows:
        if r[3] in ("running", "dispatching", "queued"):
            return r
    return rows[0] if rows else None


# ── SSE streaming ─────────────────────────────────────────────────────────────

def stream(execution_id, fase, variant, status):
    url = f"{API_BASE}/{execution_id}/local-logs/stream"
    print(f"{BOLD}Streaming:{RESET} {CYAN}{fase}{RESET}/{variant}  {_s(status)}")
    print(f"{DIM}{url}{RESET}")
    print("─" * 72)

    current_step = None
    buf = ""

    try:
        req = urllib.request.Request(url, headers={"Accept": "text/event-stream"})
        # timeout=600 para runs activos; el endpoint envía `done` rápido si ya terminó
        with urllib.request.urlopen(req, timeout=600) as resp:
            while True:
                chunk = resp.read(512)
                if not chunk:
                    break
                buf += chunk.decode(errors="replace")
                while "\n\n" in buf:
                    event, buf = buf.split("\n\n", 1)
                    for line in event.splitlines():
                        if not line.startswith("data: "):
                            continue
                        data = json.loads(line[6:])
                        if data.get("done"):
                            print(f"\n{GREEN}{'─'*32} DONE {'─'*32}{RESET}\n")
                            return
                        step     = data.get("step", "")
                        log_line = data.get("line", "")
                        if step != current_step:
                            current_step = step
                            print(f"\n{CYAN}{BOLD}▶ {step}{RESET}")
                        # Colorear marcadores de estado inline
                        if log_line.startswith("✓"):
                            print(f"  {GREEN}{log_line}{RESET}")
                        elif log_line.startswith("✗") or "[error]" in log_line:
                            print(f"  {RED}{log_line}{RESET}")
                        elif log_line.startswith("[warn]"):
                            print(f"  {YELLOW}{log_line}{RESET}")
                        elif log_line.startswith("$"):
                            print(f"  {DIM}{log_line}{RESET}")
                        else:
                            print(f"  {log_line}")

    except KeyboardInterrupt:
        print(f"\n{DIM}(interrumpido){RESET}")
    except Exception as e:
        print(f"\n{RED}Error de stream: {e}{RESET}")
        print("¿Está el backend corriendo?  →  make logs-backend")


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    prefix = sys.argv[1] if len(sys.argv) > 1 else None
    rows   = list_local()

    if not rows:
        print(f"{YELLOW}No hay ejecuciones locales en la DB.{RESET}")
        print("Lanza una fase con runner=Local desde Vista2 primero.")
        return

    print_table(rows)

    row = pick(rows, prefix)
    if not row:
        sys.exit(1)

    id_, fase, variant, status, _ = row
    stream(id_, fase, variant, status)


if __name__ == "__main__":
    main()
