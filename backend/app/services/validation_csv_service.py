"""
Escribe una fila al CSV de validación cuando una ejecución alcanza estado terminal.

Activación:
  - Global:      config/config.yaml  →  validation_mode.enabled: true/false
  - Por pipeline: config/pipelines.yaml → mlops4rtedge.validation_mode: true

El flag del pipeline tiene prioridad sobre el global.
Ruta del CSV: validation_mode.output_csv en config.yaml (default: analisis/validacion_variants.csv).

Columnas (mismo formato que analisis/ejemplo.csv):
  experiment, variant, phase, runner, runner_code, parent_variant,
  created_at, started_at, completed_at,
  queue_seconds, execution_seconds, total_seconds, status
"""

import csv
import json
import logging
from pathlib import Path

from app.core.config import PROJECT_ROOT, load_app_config, load_pipelines_config

log = logging.getLogger(__name__)

RUNNER_CODES: dict[str, int] = {
    "Local": 1,
    "GithubActions": 2,
    "K8s-8gb": 3,
    "K8s-24gb": 4,
    "ESP32-self-hosted": 5,
}

CSV_HEADERS = [
    "experiment", "variant", "phase", "runner", "runner_code",
    "parent_variant", "created_at", "started_at", "completed_at",
    "queue_seconds", "execution_seconds", "total_seconds", "status",
]


def is_enabled(pipeline_id: str) -> bool:
    pipelines = load_pipelines_config()
    proj = pipelines.get(pipeline_id, {})
    if "validation_mode" in proj:
        return bool(proj["validation_mode"])
    app_cfg = load_app_config()
    return bool(app_cfg.get("validation_mode", {}).get("enabled", False))


def _output_path() -> Path:
    app_cfg = load_app_config()
    rel = app_cfg.get("validation_mode", {}).get("output_csv", "analisis/validacion_variants.csv")
    p = Path(rel)
    return p if p.is_absolute() else PROJECT_ROOT / p


def _seconds_or_empty(ts_a: str | None, ts_b: str | None) -> int | str:
    v = _seconds_between(ts_a, ts_b)
    return v if v is not None else ""


def _seconds_between(ts_a: str | None, ts_b: str | None) -> int | None:
    if not ts_a or not ts_b:
        return None
    from datetime import datetime
    try:
        a = datetime.fromisoformat(ts_a)
        b = datetime.fromisoformat(ts_b)
        return max(0, int((b - a).total_seconds()))
    except Exception:
        return None


def _experiment_from_variant(variant: str) -> int | None:
    # Format vX_AYBC: char at index 3 is the experiment digit A
    try:
        if len(variant) >= 5 and variant[0] == "v" and variant[2] == "_":
            return int(variant[3])
    except (ValueError, IndexError):
        pass
    return None


def _normalize_parent(parent: str | None) -> str:
    if not parent:
        return ""
    p = parent.strip()
    if p.startswith("["):
        try:
            lst = json.loads(p)
            return ", ".join(str(x) for x in lst)
        except Exception:
            pass
    return p


def append_row(
    *,
    pipeline_id: str,
    variant: str,
    phase: str,
    runner: str,
    parent: str | None,
    created_at: str | None,
    started_at: str | None,
    completed_at: str | None,
    status: str,
) -> None:
    if not is_enabled(pipeline_id):
        return

    csv_path = _output_path()
    csv_path.parent.mkdir(parents=True, exist_ok=True)

    row = {
        "experiment": _experiment_from_variant(variant),
        "variant": variant,
        "phase": phase,
        "runner": runner,
        "runner_code": RUNNER_CODES.get(runner, 0),
        "parent_variant": _normalize_parent(parent),
        "created_at": created_at or "",
        "started_at": started_at or "",
        "completed_at": completed_at or "",
        "queue_seconds": _seconds_or_empty(created_at, started_at),
        "execution_seconds": _seconds_or_empty(started_at, completed_at),
        "total_seconds": _seconds_or_empty(created_at, completed_at),
        "status": status,
    }

    try:
        existing_rows = []
        if csv_path.exists() and csv_path.stat().st_size > 0:
            with open(csv_path, newline="") as fh:
                reader = csv.DictReader(fh)
                existing_rows = [
                    r for r in reader
                    if not (r.get("variant") == variant and r.get("phase") == phase)
                ]

        with open(csv_path, "w", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=CSV_HEADERS)
            writer.writeheader()
            writer.writerows(existing_rows)
            writer.writerow(row)
        log.info("validation_csv: %s/%s → %s [%s]", phase, variant, status, csv_path)
    except Exception as exc:
        log.warning("validation_csv: write failed: %s", exc)
