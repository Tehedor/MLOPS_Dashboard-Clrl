import asyncio
from datetime import datetime, timezone

import httpx
from app.core.config import settings

_DISPATCH_URL = f"https://api.github.com/repos/{settings.github_repo}/dispatches"
_RUNS_URL     = f"https://api.github.com/repos/{settings.github_repo}/actions/runs"
_HEADERS = {
    "Accept": "application/vnd.github.v3+json",
    "X-GitHub-Api-Version": "2022-11-28",
}

# Param keys that don't map to simple .upper() of their schema name
_PARAM_KEY_REMAP = {
    'raw_path':                       'RAW',
    'window_strategy':                'STRATEGY',
    'imbalance_max_majority_samples': 'IMBALANCE_MAX_MAJ',
}


def _normalize_params(params: dict) -> dict:
    """Map schema snake_case param keys to Makefile variable names (UPPER_CASE)."""
    return {_PARAM_KEY_REMAP.get(k, k.upper()): v for k, v in params.items()}


async def _find_run_after(created_after: str) -> str | None:
    """Return the run_id of the most recent repository_dispatch run created after the given ISO ts."""
    if not settings.github_token:
        return None
    headers = {**_HEADERS, "Authorization": f"Bearer {settings.github_token}"}
    params  = {"event": "repository_dispatch", "per_page": "5"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(_RUNS_URL, headers=headers, params=params)
        if resp.status_code != 200:
            return None
        for run in resp.json().get("workflow_runs", []):
            if run.get("created_at", "") >= created_after:
                return str(run["id"])
    except Exception:
        pass
    return None


async def dispatch_phase(fase: str, variant: str, parent: str | None, params: dict, runner_json: str | None = None) -> str | None:
    """Dispatch a workflow and return the GH run_id if it can be found."""
    payload = {
        "event_type": "ejecutar-fase-api",
        "client_payload": {
            "fase": fase,
            "variant_id": variant,
            **({"parent_variant": parent} if parent else {}),
            "params": _normalize_params(params),
            **({"runner": runner_json} if runner_json else {}),
        },
    }
    headers      = {**_HEADERS, "Authorization": f"Bearer {settings.github_token}"}
    dispatch_ts  = datetime.now(timezone.utc).isoformat()
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(_DISPATCH_URL, json=payload, headers=headers)
        resp.raise_for_status()

    # Give GH ~2 s to register the new run, then fetch its id
    await asyncio.sleep(2)
    return await _find_run_after(dispatch_ts)


async def fetch_run_status(gh_run_id: str) -> dict | None:
    """Returns {'status': ..., 'conclusion': ...} for a GH run, or None on error."""
    if not settings.github_token:
        return None
    headers = {**_HEADERS, "Authorization": f"Bearer {settings.github_token}"}
    run_url = f"https://api.github.com/repos/{settings.github_repo}/actions/runs/{gh_run_id}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(run_url, headers=headers)
        if resp.status_code != 200:
            return None
        data = resp.json()
        return {"status": data.get("status"), "conclusion": data.get("conclusion")}
    except Exception:
        return None


async def fetch_run_logs(gh_run_id: str) -> list[dict]:
    """Devuelve los logs de cada job de un run directamente desde la GH API."""
    if not settings.github_token:
        return []
    headers = {**_HEADERS, "Authorization": f"Bearer {settings.github_token}"}
    jobs_url = f"https://api.github.com/repos/{settings.github_repo}/actions/runs/{gh_run_id}/jobs"
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(jobs_url, headers=headers)
        if resp.status_code != 200:
            return []
        jobs = resp.json().get("jobs", [])
        results = []
        for job in jobs:
            log_url = f"https://api.github.com/repos/{settings.github_repo}/actions/jobs/{job['id']}/logs"
            log_resp = await client.get(log_url, headers=headers)
            if log_resp.status_code == 200:
                results.append({
                    "step_name": job["name"],
                    "content":   log_resp.text[:200_000],
                })
    return results
