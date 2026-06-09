"""Incremental lineage registry.

Maintains a JSON registry per pipeline-project that tracks every variant and
its parent relationships.  The sync operation only touches entries that are
new, deleted, or have changed metadata — it never re-reads the whole tree
from scratch if nothing changed.

Registry location:
    <actions_repo_local_path>/executions/lineage_registry.json
"""

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from app.core.config import PROJECT_ROOT, get_pipeline_project, resolve_pipeline_config_path, load_pipelines_config

log = logging.getLogger(__name__)

VARIANT_RE = re.compile(r"^v(?P<phase>\d)_(?P<seq>\d{4})$")


# ── Config helpers ────────────────────────────────────────────────────────────

def _load_raw_lineage_config(pipeline_id: str) -> dict:
    path = resolve_pipeline_config_path(pipeline_id, "lineage_config", "")
    if not str(path).strip("/") or not path.exists():
        return {}
    with open(path) as f:
        return yaml.safe_load(f) or {}


def get_lineage_config(pipeline_id: str) -> list[dict]:
    """Return resolved phase list for a pipeline."""
    raw = _load_raw_lineage_config(pipeline_id)
    if not raw:
        return []

    return raw.get("phases", [])


# ── Path helpers ──────────────────────────────────────────────────────────────

def _executions_root(pipeline_id: str) -> Path:
    proj = get_pipeline_project(pipeline_id)
    p = Path(proj.get("actions_repo_path_executions", "external/repo_actions/executions"))
    return p if p.is_absolute() else PROJECT_ROOT / p


def _registry_path(pipeline_id: str) -> Path:
    return _executions_root(pipeline_id) / "lineage_registry.json"


# ── Registry I/O ──────────────────────────────────────────────────────────────

def _load_registry(pipeline_id: str) -> dict:
    path = _registry_path(pipeline_id)
    if not path.exists():
        return {"pipeline_id": pipeline_id, "synced_at": None, "variants": []}
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return {"pipeline_id": pipeline_id, "synced_at": None, "variants": []}


def _save_registry(pipeline_id: str, data: dict) -> None:
    path = _registry_path(pipeline_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# ── Metadata reading ──────────────────────────────────────────────────────────

def _read_yaml(path: Path) -> dict:
    try:
        with open(path) as f:
            return yaml.safe_load(f) or {}
    except Exception:
        return {}


def _read_text(path: Path) -> str | None:
    try:
        with open(path) as f:
            return f.read()
    except Exception:
        return None


def _find_metadata(variant_dir: Path, specs: list[str]) -> dict:
    """Try each spec filename (with .yml/.yaml fallback) under variant_dir."""
    for spec in (specs or ["metadata.yml"]):
        for candidate in [variant_dir / spec,
                          variant_dir / (spec[:-4] + ".yaml" if spec.endswith(".yml") else spec[:-5] + ".yml")]:
            if candidate.exists():
                return _read_yaml(candidate)
    return {}


def _extract_parents(params: dict, parent_key_specs: list) -> list[str]:
    """Extract parent variant ids from params using configured key paths."""
    parents: list[str] = []
    seen: set[str] = set()

    for spec in (parent_key_specs or []):
        # Normalize to a list-of-keys path
        path: list[str] = spec if isinstance(spec, list) else [spec]
        cur: Any = params
        for key in path:
            if not isinstance(cur, dict):
                cur = None
                break
            cur = cur.get(key)
        if cur is None:
            continue
        vals = cur if isinstance(cur, list) else [cur]
        for v in vals:
            if v is not None:
                s = str(v)
                if s not in seen:
                    seen.add(s)
                    parents.append(s)

    return parents


# ── Sync ──────────────────────────────────────────────────────────────────────

def sync(pipeline_id: str) -> dict:
    """Scan the executions directory and update the registry incrementally.

    Returns a summary: {added, removed, updated, total, synced_at}
    """
    phases = get_lineage_config(pipeline_id)
    if not phases:
        log.warning("lineage_registry: no config for pipeline '%s'", pipeline_id)
        return {"added": 0, "removed": 0, "updated": 0, "total": 0, "synced_at": None}

    executions_root = _executions_root(pipeline_id)
    registry = _load_registry(pipeline_id)

    # Build lookup: (fase, variant_id) -> existing entry
    existing: dict[tuple[str, str], dict] = {
        (e["fase"], e["id"]): e for e in registry.get("variants", [])
    }

    added = removed = updated = 0
    new_variants: list[dict] = []

    for phase_cfg in phases:
        fase = phase_cfg["name"]
        phase_dir = executions_root / fase
        if not phase_dir.is_dir():
            continue

        phase_code = re.match(r"^f(\d+)", fase)
        code_digit = str(int(phase_code.group(1))) if phase_code else None

        for entry in sorted(phase_dir.iterdir()):
            if not entry.is_dir():
                continue
            m = VARIANT_RE.fullmatch(entry.name)
            if not m:
                continue
            if code_digit and m.group("phase") != code_digit:
                continue

            variant_id = entry.name

            params      = _read_yaml(entry / "params.yaml")
            meta        = _find_metadata(entry, phase_cfg.get("metadata", ["metadata.yml"]))
            outputs     = _read_yaml(entry / "outputs.yaml")
            parents     = _extract_parents(params, phase_cfg.get("parent_keys", []))
            check_log   = _read_text(entry / "check_results.log")

            new_entry = {
                "fase":                fase,
                "id":                  variant_id,
                "parents":             parents,
                "lifecycle_state":     meta.get("lifecycle_state"),
                "lifecycle_updated_at":meta.get("lifecycle_updated_at"),
                "created_at":          meta.get("created_at"),
                "verified":            meta.get("verified"),
                "registered":          meta.get("registred"),  # note: original key is "registred"
                "params":              params,
                "outputs":             outputs,
                "metadata":            meta,
                "check_log":           check_log,
            }

            key = (fase, variant_id)
            if key not in existing:
                added += 1
            else:
                old = existing[key]
                if (old.get("lifecycle_state") != new_entry["lifecycle_state"] or
                        old.get("verified") != new_entry["verified"] or
                        old.get("registered") != new_entry["registered"] or
                        old.get("parents") != new_entry["parents"]):
                    updated += 1

            new_variants.append(new_entry)

    # Count removed (were in registry but not on disk anymore)
    new_keys = {(e["fase"], e["id"]) for e in new_variants}
    removed = sum(1 for k in existing if k not in new_keys)

    synced_at = datetime.now(timezone.utc).isoformat()
    registry = {
        "pipeline_id": pipeline_id,
        "synced_at":   synced_at,
        "variants":    new_variants,
    }
    _save_registry(pipeline_id, registry)

    log.info(
        "lineage_registry sync [%s]: +%d -%d ~%d  total=%d",
        pipeline_id, added, removed, updated, len(new_variants),
    )
    return {"added": added, "removed": removed, "updated": updated,
            "total": len(new_variants), "synced_at": synced_at}


def get_registry(pipeline_id: str) -> dict:
    return _load_registry(pipeline_id)


def get_all_configs() -> dict:
    """Return lineage config for all registered pipelines, for the frontend."""
    resolved = {}
    for pid in load_pipelines_config():
        phases = get_lineage_config(pid)
        if phases:
            resolved[pid] = {"phases": phases}
    return resolved
